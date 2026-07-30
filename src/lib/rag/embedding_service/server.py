"""
RAG Embedding 微服务
===================
Embedding:  BAAI/bge-small-zh-v1.5  (24MB, 512维, 中文优化)
Rerank:     基于同一模型的余弦相似度重排（无需额外模型）

启动: python server.py
端口: 8765

模型下载到项目内的 models/ 目录，不污染系统目录。
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import List

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ---- 配置 ----
# 模型下载目录: 优先用环境变量，没有则自动检测
# - 本地开发: src/lib/rag/embedding_service/server.py → 往上 4 级到项目根
# - Docker:    /app/server.py → HF_HOME 由 Dockerfile 设置为 /app/models
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# 检测是否在 Docker 中（server.py 直接在 /app/ 下）
# 还是本地开发（在 embedding_service/ 子目录中）
if os.path.basename(PROJECT_ROOT) == "embedding_service":
    # 本地开发: embedding_service → rag → lib → src → 项目根
    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(PROJECT_ROOT))))
else:
    # Docker: server.py 直接在 /app/ 下
    ROOT = PROJECT_ROOT

MODELS_DIR = os.environ.get("HF_HOME", os.path.join(ROOT, "models"))
os.makedirs(MODELS_DIR, exist_ok=True)
os.environ["HF_HOME"] = MODELS_DIR
os.environ["TRANSFORMERS_CACHE"] = os.path.join(MODELS_DIR, "transformers")

EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"
PORT = 8765

# ---- 日志 ----
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger("embedding-service")

# ---- 请求/响应模型 ----
class EmbedRequest(BaseModel):
    texts: List[str]

class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimensions: int
    model: str

class RerankRequest(BaseModel):
    query: str
    documents: List[str]

class RerankResponse(BaseModel):
    scores: List[float]
    indices: List[int]
    model: str

# ---- 全局模型 ----
embedding_model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时加载模型，关闭时释放"""
    global embedding_model

    # 限制线程数，避免华为云 ECS cgroup pids 限制导致 "can't start new thread"
    import os as _os
    _os.environ["OMP_NUM_THREADS"] = "1"
    _os.environ["MKL_NUM_THREADS"] = "1"
    _os.environ["NUMEXPR_NUM_THREADS"] = "1"
    _os.environ["TQDM_DISABLE"] = "1"  # 禁用 tqdm 进度条（会创建监控线程）
    _os.environ["TOKENIZERS_PARALLELISM"] = "false"
    _os.environ["POLARS_MAX_THREADS"] = "1"

    # transformers safetensors 加载使用 ThreadPoolExecutor 创建线程，
    # 华为云 ECS 的 pids 限制会导致 "can't start new thread"。
    # 永久 patch spawn_materialize 为同步模式，不恢复。
    from transformers import core_model_loading as _cml
    _orig_spawn2 = _cml.spawn_materialize
    def _sync_spawn(thread_pool, tensor, device=None, dtype=None, sharding_op=None, tensor_idx=None, **kwargs):
        """强制同步加载：传 thread_pool=None 避免创建线程，并立即执行返回 tensor"""
        result = _orig_spawn2(None, tensor, device=device, dtype=dtype, sharding_op=sharding_op, tensor_idx=tensor_idx, **kwargs)
        if callable(result):
            return result()  # 执行 job，返回真正的 tensor
        return result
    _cml.spawn_materialize = _sync_spawn

    logger.info(f"模型缓存目录: {MODELS_DIR}")
    logger.info(f"正在加载 Embedding 模型: {EMBEDDING_MODEL} (约 24MB)...")
    from sentence_transformers import SentenceTransformer
    embedding_model = SentenceTransformer(EMBEDDING_MODEL, device="cpu")

    dim = embedding_model.get_sentence_embedding_dimension()
    logger.info(f"✅ Embedding 模型加载完成 ({dim} 维)")
    logger.info(f"   模型大小: ~24MB | 适合 CPU 运行")

    yield

    logger.info("服务关闭中...")
    del embedding_model


app = FastAPI(title="RAG Embedding Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": EMBEDDING_MODEL,
        "cache_dir": MODELS_DIR,
    }


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    """文本 → 向量"""
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts 不能为空")

    global embedding_model
    if embedding_model is None:
        raise HTTPException(status_code=503, detail="模型尚未加载完成")

    try:
        vectors = embedding_model.encode(
            req.texts,
            normalize_embeddings=True,  # 归一化，余弦相似度 = 内积
        )

        if isinstance(vectors, np.ndarray):
            embeddings = vectors.tolist()
        else:
            embeddings = [v.tolist() if isinstance(v, np.ndarray) else v for v in vectors]

        logger.info(f"Embed: {len(req.texts)} 条文本 → {len(embeddings)} 个向量")
        return EmbedResponse(
            embeddings=embeddings,
            dimensions=len(embeddings[0]) if embeddings else 0,
            model=EMBEDDING_MODEL,
        )
    except Exception as e:
        logger.error(f"Embedding 失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rerank", response_model=RerankResponse)
async def rerank(req: RerankRequest):
    """
    重排: 用 embedding 模型分别编码 query 和 documents，
    计算余弦相似度作为重排分数。

    虽然不如 Cross-Encoder 精准，但对小模型场景完全够用，
    且不需要额外下载 400MB+ 的重排模型。
    """
    if not req.query or not req.documents:
        raise HTTPException(status_code=400, detail="query 和 documents 不能为空")

    global embedding_model
    if embedding_model is None:
        raise HTTPException(status_code=503, detail="模型尚未加载完成")

    try:
        # 编码 query 和 documents
        query_vec = embedding_model.encode(
            [req.query], normalize_embeddings=True
        )
        doc_vecs = embedding_model.encode(
            req.documents, normalize_embeddings=True
        )

        # 余弦相似度 (归一化后内积 = 余弦相似度)
        if isinstance(query_vec, np.ndarray):
            query_arr = query_vec[0]
        else:
            query_arr = np.array(query_vec[0])

        if isinstance(doc_vecs, np.ndarray):
            doc_arr = doc_vecs
        else:
            doc_arr = np.array(doc_vecs)

        scores = (doc_arr @ query_arr).tolist()

        # 按分数降序排列
        indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)

        logger.info(
            f"Rerank: '{req.query[:50]}...' → {len(req.documents)} docs, "
            f"top={scores[indices[0]]:.4f}"
        )
        return RerankResponse(
            scores=scores,
            indices=indices,
            model=f"{EMBEDDING_MODEL}-rerank",
        )
    except Exception as e:
        logger.error(f"Rerank 失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    logger.info(f"启动服务: http://localhost:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")

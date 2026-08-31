"""LLM Pool — opencode go 双模型，去限额版（对标 summer src/lib/model-pool.ts）

Tier:
  LOW  = deepseek-v4-flash（快，聊天/拆任务/标题）
  HIGH = muse-spark-1.2-contributor（便宜，规划/后台兜底）

特性（保留 summer 亮点，去掉 Token限额）：
  - 403/429 自动切下一模型
  - stream 首 chunk 探活
  - 60s 限流冷却

Env:
  OPENCODE_API_KEY  必填
  OPENCODE_BASE_URL 默认 https://opencode.go/v1
"""
from __future__ import annotations
import os
import time
import logging
from dataclasses import dataclass
from typing import Any, Iterator

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class ModelEntry:
    model_name: str
    thinking: bool = False

LOW_CHAIN = [
    ModelEntry("deepseek-v4-flash"),
]

HIGH_CHAIN = [
    ModelEntry("muse-spark-1.2-contributor"),
    ModelEntry("deepseek-v4-flash"),
]

def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()

def _base_url() -> str:
    return _env("OPENCODE_BASE_URL", "https://opencode.go/v1").rstrip("/")

def _api_key() -> str:
    return _env("OPENCODE_API_KEY") or _env("AGNES_API_KEY") or _env("DASHSCOPE_API_KEY")

def get_chain(tier: str) -> list[ModelEntry]:
    tier = (tier or "low").lower()
    if tier == "high":
        return HIGH_CHAIN
    return LOW_CHAIN

_RATE_LIMIT_UNTIL: dict[str, float] = {}
_EXHAUSTED: set[str] = set()

def _is_quota_error(err: Exception) -> bool:
    s = str(err).lower()
    return "allocationquota" in s or "freetieronly" in s or "quota" in s or "403" in s

def _is_rate_limit_error(err: Exception) -> bool:
    s = str(err).lower()
    return "429" in s or "rate limit" in s or "too many requests" in s

def _mark_rate_limited(model: str):
    _RATE_LIMIT_UNTIL[model] = time.time() + 60

def _mark_exhausted(model: str):
    _EXHAUSTED.add(model)

def _is_cooling(model: str) -> bool:
    until = _RATE_LIMIT_UNTIL.get(model, 0)
    return time.time() < until

def _client_for(entry: ModelEntry):
    try:
        from openai import OpenAI  # type: ignore
    except ImportError as e:
        raise RuntimeError("需要 pip install openai") from e
    key = _api_key()
    if not key:
        raise RuntimeError("OPENCODE_API_KEY 未配置（.env）")
    return OpenAI(api_key=key, base_url=_base_url()), entry.model_name

def completions_with_fallback(tier: str, messages: list[dict[str, Any]], **kwargs) -> tuple[Any, str]:
    chain = get_chain(tier)
    last_err: Exception | None = None
    for entry in chain:
        if entry.model_name in _EXHAUSTED or _is_cooling(entry.model_name):
            continue
        try:
            client, model = _client_for(entry)
            extra = {}
            if entry.thinking:
                extra["extra_body"] = {"enable_thinking": True}
            resp = client.chat.completions.create(model=model, messages=messages, **{**extra, **kwargs})
            logger.info("[llm_pool] completions model=%s tier=%s", model, tier)
            return resp, model
        except Exception as e:
            if _is_quota_error(e):
                if _is_rate_limit_error(e):
                    _mark_rate_limited(entry.model_name)
                    logger.warning("[llm_pool] %s 限流，冷却60s", entry.model_name)
                else:
                    _mark_exhausted(entry.model_name)
                    logger.warning("[llm_pool] %s 额度耗尽，降级", entry.model_name)
                last_err = e
                continue
            raise
    raise last_err or RuntimeError(f"[llm_pool] {tier} 无可用模型")

def stream_with_fallback(tier: str, messages: list[dict[str, Any]], **kwargs) -> tuple[Iterator[str], str]:
    chain = get_chain(tier)
    last_err: Exception | None = None
    for entry in chain:
        if entry.model_name in _EXHAUSTED or _is_cooling(entry.model_name):
            continue
        try:
            client, model = _client_for(entry)
            extra = {}
            if entry.thinking:
                extra["extra_body"] = {"enable_thinking": True}
            stream = client.chat.completions.create(model=model, messages=messages, stream=True, **{**extra, **kwargs})
            it = iter(stream)
            first = next(it, None)
            if first is None:
                return iter([]), model
            def gen():
                yield first
                for chunk in it:
                    yield chunk
            logger.info("[llm_pool] stream model=%s tier=%s", model, tier)
            return gen(), model
        except Exception as e:
            if _is_quota_error(e):
                if _is_rate_limit_error(e):
                    _mark_rate_limited(entry.model_name)
                else:
                    _mark_exhausted(entry.model_name)
                last_err = e
                continue
            raise
    raise last_err or RuntimeError(f"[llm_pool] {tier} 无可用模型")

def embedding_with_fallback(texts: list[str]) -> list[list[float]]:
    model = os.getenv("EMBEDDING_MODEL", "text-embedding-v3")
    try:
        from openai import OpenAI
        c = OpenAI(api_key=_api_key(), base_url=_base_url())
        out: list[list[float]] = []
        for i in range(0, len(texts), 10):
            batch = texts[i:i+10]
            resp = c.embeddings.create(model=model, input=batch)
            out.extend([d.embedding for d in resp.data])
        return out
    except Exception as e:
        raise RuntimeError(f"embedding 失败: {e}") from e

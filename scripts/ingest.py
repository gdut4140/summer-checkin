# -*- coding: utf-8 -*-
"""
Document ingestion script (Python)
Usage: python scripts/ingest.py [filename]

Prerequisites: Embedding service running on localhost:8765
"""

import sys
import os
import json
import re
import requests
import pymysql

EMBEDDING_URL = "http://localhost:8765/embed"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KNOWLEDGE_DIR = os.path.join(ROOT, "knowledge")


def load_db_config():
    env_path = os.path.join(ROOT, ".env")
    config = {}
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                config[k.strip()] = v.strip().strip('"').strip("'")
    url = config.get("DATABASE_URL", "")
    m = re.match(r"mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)", url)
    if not m:
        raise ValueError("Cannot parse DATABASE_URL: " + url)
    return {
        "user": m.group(1),
        "password": m.group(2),
        "host": m.group(3),
        "port": int(m.group(4)),
        "database": m.group(5),
        "charset": "utf8mb4",
    }


def split_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    if not text or not text.strip():
        return []

    paragraphs = text.split("\n\n")
    chunks = []

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(para) <= chunk_size:
            chunks.append(para)
            continue

        start = 0
        while start < len(para):
            end = min(start + chunk_size, len(para))
            chunk = para[start:end]

            # 尽量在中文句子边界断开
            if end < len(para):
                for sep in ["。", "？", "！", ".", "?", "!"]:
                    idx = chunk.rfind(sep)
                    if idx > chunk_size * 0.6:
                        chunk = chunk[: idx + 1]
                        break

            chunk = chunk.strip()
            if not chunk:
                break  # 安全兜底

            chunks.append(chunk)
            # 确保 start 始终前进（防止死循环）
            advance = len(chunk) - overlap
            if advance <= 0:
                advance = 1  # 最小前进 1 字符
            start += advance

    print("[Chunk] %d chars -> %d chunks (size=%d, overlap=%d)" % (len(text), len(chunks), chunk_size, overlap))
    return chunks


def embed_texts(texts):
    if not texts:
        return []

    all_embeddings = []
    batch_size = 32

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        print("  Embedding %d-%d/%d..." % (i + 1, i + len(batch), len(texts)))

        resp = requests.post(
            EMBEDDING_URL,
            json={"texts": batch},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        all_embeddings.extend(data["embeddings"])

    return all_embeddings


def main():
    if len(sys.argv) < 1:
        print("Usage: python scripts/ingest.py [filename]")
        sys.exit(1)

    filter_name = sys.argv[1] if len(sys.argv) > 1 else None

    try:
        db_cfg = load_db_config()
    except Exception as e:
        print("Failed to load DB config: %s" % e)
        sys.exit(1)

    print("[DB] %s@%s:%d/%s" % (db_cfg["user"], db_cfg["host"], db_cfg["port"], db_cfg["database"]))

    files = [f for f in os.listdir(KNOWLEDGE_DIR) if f.endswith((".txt", ".md"))]
    if filter_name:
        files = [f for f in files if f == filter_name]

    if not files:
        print("No .txt or .md files found in knowledge/")
        sys.exit(1)

    print("Found %d file(s)\n" % len(files))

    conn = pymysql.connect(**db_cfg)
    cursor = conn.cursor()

    try:
        for filename in files:
            filepath = os.path.join(KNOWLEDGE_DIR, filename)
            source_type = "markdown" if filename.endswith(".md") else "text"

            print("Ingesting: %s" % filename)

            with open(filepath, "r", encoding="utf-8") as f:
                text = f.read()

            chunks = split_text(text)
            if not chunks:
                print("  Empty file, skipped\n")
                continue

            # Delete old chunks (idempotent)
            cursor.execute(
                "DELETE FROM DocumentChunk WHERE sourceName = %s",
                (filename,),
            )
            conn.commit()

            # Embed
            embeddings = embed_texts(chunks)

            # Insert into DB
            import uuid
            from datetime import datetime

            saved = 0
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                chunk_id = "cm" + uuid.uuid4().hex[:23]
                cursor.execute(
                    "INSERT INTO DocumentChunk (id, sourceName, sourceType, chunkIndex, content, embedding, createdAt)"
                    " VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (chunk_id, filename, source_type, i, chunk, json.dumps(emb), now),
                )
                saved += 1

            conn.commit()
            print("  Done: %d chunks\n" % saved)

    finally:
        cursor.close()
        conn.close()

    print("All done!")


if __name__ == "__main__":
    main()

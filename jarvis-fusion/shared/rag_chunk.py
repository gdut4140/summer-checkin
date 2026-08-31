"""RAG chunk — 复用 summer src/lib/rag/chunk.ts 逻辑（500/50, markdown按##）"""
from __future__ import annotations
import re

def split_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    if not text or not text.strip():
        return []
    paragraphs = re.split(r"\n{2,}", text)
    chunks: list[str] = []
    for para in paragraphs:
        trimmed = para.strip()
        if not trimmed:
            continue
        if len(trimmed) <= chunk_size:
            chunks.append(trimmed)
            continue
        start = 0
        while start < len(trimmed):
            end = min(start + chunk_size, len(trimmed))
            chunk = trimmed[start:end]
            if end < len(trimmed):
                for sep in ["。", "！", "？", ".", "?", "!"]:
                    idx = chunk.rfind(sep)
                    if idx > chunk_size * 0.6:
                        chunk = chunk[: idx + 1]
                        break
            chunk = chunk.strip()
            if not chunk:
                break
            chunks.append(chunk)
            if end >= len(trimmed):
                break
            advance = len(chunk) - overlap
            start += advance if advance > 0 else 1
    return chunks

def split_markdown(text: str, max_chunk_size: int = 800) -> list[str]:
    if not text or not text.strip():
        return []
    sections = re.split(r"\n(?=## )", text)
    chunks: list[str] = []
    for sec in sections:
        trimmed = sec.strip()
        if not trimmed:
            continue
        if len(trimmed) <= max_chunk_size:
            chunks.append(trimmed)
        else:
            lines = trimmed.split("\n")
            heading = lines[0]
            body = "\n".join(lines[1:])
            for bc in split_text(body, max_chunk_size, 50):
                chunks.append(f"{heading}\n{bc}")
    return chunks

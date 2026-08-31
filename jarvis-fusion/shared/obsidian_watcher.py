"""Obsidian Watcher — 监听 Vault 增量入库（对标 summer knowledge-upload + chunk）

监听：D:\OptoKB/6-Agent 全区 + 可选 3-Resource/5-Permanent
忽略：.obsidian/_Attachments/_Templates/.git/.claudian/.terse
去重：文件hash比对，仅改动才重分片
"""
from __future__ import annotations
import hashlib
import time
import logging
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

DEFAULT_VAULT = Path(r"D:\OptoKB")
WATCH_ROOTS = [
    Path(r"D:\OptoKB\6-Agent"),
    Path(r"D:\OptoKB\3-Resource"),
    Path(r"D:\OptoKB\5-Permanent"),
]
IGNORE_DIRS = {".obsidian", "_Attachments", "_Templates", ".git", ".claudian", ".terse", ".trash"}

def file_hash(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()[:16]

def should_ignore(p: Path, vault: Path) -> bool:
    try:
        rel = p.relative_to(vault)
    except ValueError:
        rel = p
    for part in rel.parts:
        if part in IGNORE_DIRS or part.startswith("."):
            return True
    if p.suffix.lower() not in {".md", ".txt"}:
        return True
    return False

def is_private_frontmatter(text: str) -> bool:
    if text.startswith("---"):
        fm = text.split("---", 2)
        if len(fm) >= 2 and "private: true" in fm[1].lower():
            return True
    return False

class VaultWatcher:
    def __init__(self, vault: Path | None = None, roots: list[Path] | None = None, on_change: Callable[[Path, str], None] | None = None):
        self.vault = vault or DEFAULT_VAULT
        self.roots = roots or WATCH_ROOTS
        self.on_change = on_change
        self._hashes: dict[str, str] = {}
        self._running = False

    def scan_once(self) -> list[Path]:
        changed: list[Path] = []
        for root in self.roots:
            if not root.exists():
                continue
            for p in root.rglob("*"):
                if not p.is_file():
                    continue
                if should_ignore(p, self.vault):
                    continue
                try:
                    text = p.read_text(encoding="utf-8")
                except Exception:
                    continue
                if is_private_frontmatter(text):
                    continue
                h = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
                key = str(p)
                if self._hashes.get(key) != h:
                    self._hashes[key] = h
                    changed.append(p)
                    if self.on_change:
                        try:
                            self.on_change(p, text)
                        except Exception:
                            logger.exception("on_change failed %s", p)
        return changed

    def start_polling(self, interval: float = 3.0):
        self._running = True
        logger.info("[watcher] start vault=%s roots=%s interval=%s", self.vault, self.roots, interval)
        # 首次全量
        self.scan_once()
        while self._running:
            time.sleep(interval)
            self.scan_once()

    def stop(self):
        self._running = False

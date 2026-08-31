"""Vault config — 可配置化（对应任务6）"""
from pathlib import Path
import os

VAULT_PATH = Path(os.getenv("VAULT_PATH", r"D:\OptoKB"))
WATCH_ROOTS = [
    VAULT_PATH / "6-Agent",
    Path(os.getenv("VAULT_WATCH_2", str(VAULT_PATH / "3-Resource"))),
    Path(os.getenv("VAULT_WATCH_3", str(VAULT_PATH / "5-Permanent"))),
]
IGNORE_DIRS = {".obsidian", "_Attachments", "_Templates", ".git", ".claudian", ".terse"}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 200_000
MAX_CHUNKS = 500

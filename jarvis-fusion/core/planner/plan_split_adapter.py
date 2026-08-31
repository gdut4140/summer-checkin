"""Plan split adapter — 复用 summer plan-split + 包 Planner Validation（14.5）

Summer: doc -> LLM -> PlanTask平铺
JARVIS: ApprovedIntent -> PlannerInput -> LLM Draft -> Planner.validate -> TaskRegistry
"""
from __future__ import annotations
import re
import hashlib
from dataclasses import dataclass

SPLIT_SYSTEM_PROMPT = """你是学习计划拆解助手，把计划文档拆成可执行、可打勾的平铺任务。
要求：平铺一条条，不按天分组，每任务具体可量化，保留文档既有目标，一般不超过30条。
只输出JSON：{"tasks":[{"title":"", "description":"", "category":"study|project|review|exercise","priority":"high|normal|low"}]}"""

def normalize_title(t: str) -> str:
    return re.sub(r"\s+", " ", t.strip().lower())

def extract_json(text: str) -> str:
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    return (m.group(1) if m else text).strip()

def plan_task_source(plan: dict) -> str:
    # 对齐 summer lib/plan-tasks planTaskSource
    parts = []
    if plan.get("goal"):
        parts.append(plan["goal"])
    if plan.get("document"):
        parts.append(plan["document"])
    return "\n\n".join(p for p in parts if p)

def plan_task_source_hash(plan: dict) -> str:
    return hashlib.sha256(plan_task_source(plan).encode("utf-8")).hexdigest()[:16]

@dataclass
class SplitResult:
    success: bool
    created: int = 0
    kept: int = 0
    reason: str = ""

def validate_plan(tasks: list[dict], autonomy_level: int = 1) -> list[dict]:
    """Planner校验闸：只降权，不提权；超30条截断"""
    out = []
    for t in tasks[:30]:
        title = str(t.get("title","")).strip()
        if not (1 <= len(title) <= 160):
            continue
        t["priority"] = t.get("priority", "normal")
        out.append(t)
    return out

"use client";

import { useState } from "react";
import {
  Brain,
  Bell,
  ClockCounterClockwise,
  Robot,
} from "@phosphor-icons/react";
import { CoachOverview } from "./coach-overview";
import { NotificationCenter } from "./notification-center";
import { DecisionTimeline } from "./decision-timeline";
import { AgentWorkspace, type AgentRunListItem } from "./agent-workspace";
export type { AgentRunListItem };

// ---- Tab Config ----

type TabKey = "overview" | "notifications" | "decisions" | "workspace";

const tabs: { key: TabKey; label: string; icon: typeof Brain; description: string }[] = [
  {
    key: "overview",
    label: "教练面板",
    icon: Brain,
    description: "AI 洞察与学习概览",
  },
  {
    key: "notifications",
    label: "通知中心",
    icon: Bell,
    description: "消息与报告",
  },
  {
    key: "decisions",
    label: "活动记录",
    icon: ClockCounterClockwise,
    description: "Agent 操作日志",
  },
  {
    key: "workspace",
    label: "工作台",
    icon: Robot,
    description: "创建与管理 Agent 运行",
  },
];

// ---- Props ----

interface Props {
  initialRuns: AgentRunListItem[];
}

// ---- Main Component ----

export function AgentTabs({ initialRuns }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-6">
      {/* ── Tab 导航栏 ── */}
      <div className="glass-panel rounded-2xl p-1.5">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon
                  className="h-4 w-4"
                  weight={isActive ? "fill" : "regular"}
                />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab 内容 ── */}
      <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === "overview" && <CoachOverview />}
        {activeTab === "notifications" && <NotificationCenter />}
        {activeTab === "decisions" && <DecisionTimeline />}
        {activeTab === "workspace" && <AgentWorkspace initialRuns={initialRuns} />}
      </div>
    </div>
  );
}

export { generatePlanForPlan } from "./service";
export type { GeneratePlanInput } from "./service";
export {
  agentRunStatuses,
  planDraftSchema,
  planTaskDraftSchema,
  analysisFindingSchema,
  agentActionSchema,
  agentAnalysisSchema,
} from "./types";
export type {
  AgentContextSnapshot,
  AgentRunStatus,
  PlanDraft,
  AnalysisFinding,
  AgentAction,
  AgentAnalysis,
} from "./types";

// Phase 1: Agent Runtime
export { AGENT_COACH_PROMPT } from "./prompts";
export {
  observe,
  analyze,
  executeAction,
  runLearningAgent,
  agentRunGoal,
  fallbackAnalysis as _fallbackAnalysis,
} from "./runtime";
export type {
  LearningContext,
  AnalyzeResult,
  AgentRunResult,
  ExecutionResult,
} from "./runtime";

// Phase 3: Report generation
export {
  generateDailyReport,
  generateWeeklyReport,
  formatReportAsMarkdown,
} from "./report";

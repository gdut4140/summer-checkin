export interface PlanWithProgress {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  targetHours: number;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdAt: Date;
  totalHours: number;
  progress: number;
}

export interface CheckinWithPlan {
  id: string;
  content: string;
  hours: number;
  subject: string | null;
  mood: string | null;
  checkinDate: Date;
  planName?: string | null;
}

export interface DashboardStats {
  streak: number;
  todayHours: number;
  weekCompletion: number;
  userRank: number;
  totalUsers: number;
  recentCheckins: CheckinWithPlan[];
  weeklyData: { date: string; hours: number }[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  totalHours: number;
  streak: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

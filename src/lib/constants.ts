export const MOODS = [
  { value: "excited", emoji: "🤩", label: "Excited" },
  { value: "happy", emoji: "😊", label: "Happy" },
  { value: "neutral", emoji: "😐", label: "Neutral" },
  { value: "tired", emoji: "😴", label: "Tired" },
  { value: "stressed", emoji: "😤", label: "Stressed" },
  { value: "motivated", emoji: "💪", label: "Motivated" },
] as const;

export type Mood = (typeof MOODS)[number]["value"];

export const SUBJECT_SUGGESTIONS = [
  "React",
  "Next.js",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Python",
  "Algorithms",
  "Data Structures",
  "CSS",
  "Tailwind CSS",
  "Prisma",
  "Database",
  "System Design",
  "AI / ML",
  "Computer Networks",
  "Operating Systems",
  "Git",
  "Docker",
  "English",
  "Math",
];

import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const checkinSchema = z.object({
  content: z.string().min(1, "Please describe what you learned today"),
  hours: z.coerce.number().min(0.1, "At least 0.1 hours").max(24, "Max 24 hours"),
  subject: z.string().optional(),
  planId: z.string().optional(),
  mood: z.string().optional(),
});

export const planSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  description: z.string().optional(),
  goal: z.string().optional(),
  targetHours: z.coerce.number().min(0, "Must be 0 or more"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  bio: z.string().max(200, "Bio must be under 200 characters").optional(),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((data) => data.newPassword === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

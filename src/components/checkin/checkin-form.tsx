"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { createCheckin } from "@/app/(dashboard)/checkin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoodPicker } from "@/components/checkin/mood-picker";
import { toast } from "sonner";
import { CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";

interface Plan {
  id: string;
  name: string;
}

interface CheckinFormProps {
  existingCheckin?: {
    id: string;
    content: string;
    hours: number;
    subject: string | null;
    planId: string | null;
    mood: string | null;
  } | null;
  plans: Plan[];
}

const initialState = { success: false, error: null as string | null };

export function CheckinForm({ existingCheckin, plans }: CheckinFormProps) {
  const router = useRouter();
  const [mood, setMood] = useState(existingCheckin?.mood ?? "");
  const [subject, setSubject] = useState(existingCheckin?.subject ?? "");
  const [planId, setPlanId] = useState(existingCheckin?.planId ?? "");
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      if (mood) formData.set("mood", mood);
      if (planId) formData.set("planId", planId);
      if (subject) formData.set("subject", subject);
      try {
        await createCheckin(formData);
        toast.success("打卡成功！继续加油！");
        router.push("/dashboard");
        return { success: true, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "打卡失败，请重试";
        toast.error(msg);
        return { success: false, error: msg };
      }
    },
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <CheckCircle className="h-6 w-6 text-primary" weight="fill" />
          {existingCheckin ? "编辑今日打卡" : "今日打卡"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="content">
              今天学到了什么？ <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="content"
              name="content"
              placeholder="例如：完成了 React Server Components 章节的学习，用 Next.js App Router 搭建了一个 Demo..."
              defaultValue={existingCheckin?.content}
              required
              rows={4}
              className="resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hours">
                学习时长（小时） <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hours"
                name="hours"
                type="number"
                step="0.1"
                min="0.1"
                max="24"
                placeholder="2.5"
                defaultValue={existingCheckin?.hours || ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">学习科目</Label>
              <Input
                id="subject"
                name="subject"
                placeholder="例如：Next.js, 算法"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                list="subject-suggestions"
              />
              <datalist id="subject-suggestions">
                {[
                  "React",
                  "Next.js",
                  "TypeScript",
                  "Python",
                  "算法",
                  "CSS",
                  "数据库",
                  "AI",
                ].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="planId">关联学习计划（可选）</Label>
            {plans.length > 0 ? (
              <Select value={planId} onValueChange={(v) => setPlanId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="选择一个计划" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">无</SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                还没有学习计划。
                <Link href="/plans/new" className="text-primary hover:underline">
                  创建一个
                </Link>
              </p>
            )}
            <input type="hidden" name="planId" value={planId} />
          </div>

          <div className="space-y-2">
            <Label>今天心情如何？</Label>
            <MoodPicker value={mood} onChange={setMood} />
          </div>

          <Button type="submit" className="w-full" disabled={pending} size="lg">
            {pending ? "保存中..." : existingCheckin ? "更新打卡" : "提交打卡"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

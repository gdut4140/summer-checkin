import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileStats } from "@/components/profile/profile-stats";
import { BadgesGrid } from "@/components/profile/badges-grid";
import { ActivityTimeline } from "@/components/profile/activity-timeline";
import type { CheckinWithPlan } from "@/types";

export default async function ProfilePage() {
  const user = await requireAuth();

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  const allCheckins = await prisma.checkin.findMany({
    where: { userId: user.id },
  });
  const totalHours = allCheckins.reduce((s, c) => s + c.hours, 0);
  const totalCheckins = allCheckins.length;

  const days = new Set(
    allCheckins.map((c) => new Date(c.checkinDate).toDateString())
  );
  let streak = 0;
  const d = new Date();
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  const earnedBadges = await prisma.userBadge.findMany({
    where: { userId: user.id },
    include: { badge: true },
  });

  const allBadges = await prisma.badge.findMany();

  const recentCheckins = await prisma.checkin.findMany({
    where: { userId: user.id },
    orderBy: { checkinDate: "desc" },
    take: 10,
    include: { plan: { select: { name: true } } },
  });

  const checkinsWithPlan: CheckinWithPlan[] = recentCheckins.map((c) => ({
    id: c.id,
    content: c.content,
    hours: c.hours,
    subject: c.subject,
    mood: c.mood,
    checkinDate: c.checkinDate,
    planName: c.plan?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <ProfileHeader
        user={{
          name: fullUser?.name ?? user.name,
          email: fullUser?.email ?? user.email,
          bio: fullUser?.bio ?? null,
          image: fullUser?.image ?? null,
          createdAt: fullUser?.createdAt ?? new Date(),
        }}
      />

      <ProfileStats
        totalHours={Math.round(totalHours * 10) / 10}
        totalCheckins={totalCheckins}
        streak={streak}
      />

      <BadgesGrid
        earnedBadges={earnedBadges.map((ub) => ub.badge)}
        allBadges={allBadges}
      />

      <ActivityTimeline checkins={checkinsWithPlan} />
    </div>
  );
}

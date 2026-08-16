import { requireAuth } from "@/lib/auth-utils";
import { RainforestFocusRoom } from "@/components/focus-room/rainforest-focus-room";

export default async function DashboardPage() {
  await requireAuth();

  return <RainforestFocusRoom />;
}

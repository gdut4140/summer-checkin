import { getCurrentUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { AuthSceneShell } from "@/components/auth/auth-scene-shell";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return <AuthSceneShell>{children}</AuthSceneShell>;
}

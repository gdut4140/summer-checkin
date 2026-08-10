import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordForm } from "@/components/settings/password-form";

export default async function SettingsPage() {
  const user = await requireAuth();

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  return (
    <div className="product-page max-w-4xl">
      <header className="product-header"><div><p className="product-eyebrow">Workspace settings</p><h1 className="product-title">设置</h1><p className="product-subtitle">管理你的个人资料与账户安全。</p></div></header>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="profile" className="flex-1">个人资料</TabsTrigger>
          <TabsTrigger value="security" className="flex-1">账户安全</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileForm
            user={{
              name: fullUser?.name ?? user.name,
              bio: fullUser?.bio ?? null,
            }}
          />
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <PasswordForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

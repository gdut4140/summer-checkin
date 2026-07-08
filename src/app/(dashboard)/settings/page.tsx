import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordForm } from "@/components/settings/password-form";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const user = await requireAuth();

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          设置
        </h1>
        <p className="text-muted-foreground mt-1">
          管理你的个人资料、密码和偏好设置。
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="profile" className="flex-1">个人资料</TabsTrigger>
          <TabsTrigger value="security" className="flex-1">安全</TabsTrigger>
          <TabsTrigger value="appearance" className="flex-1">外观</TabsTrigger>
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

        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">外观设置</CardTitle>
            </CardHeader>
            <CardContent>
              <ThemeToggle />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

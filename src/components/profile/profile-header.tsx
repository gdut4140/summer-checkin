"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Gear } from "@phosphor-icons/react";
import { format } from "date-fns";

interface Props {
  user: {
    name: string;
    email: string;
    bio: string | null;
    image: string | null;
    createdAt: Date;
  };
}

export function ProfileHeader({ user }: Props) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.bio && (
              <p className="text-sm mt-1.5 max-w-[60ch]">{user.bio}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {format(user.createdAt, "yyyy 年 M 月")}加入
            </p>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="sm">
              <Gear className="h-4 w-4 mr-1.5" />
              编辑资料
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "@phosphor-icons/react";

export function NewPlanButton() {
  return (
    <Link href="/plans/new">
      <Button>
        <Plus className="h-4 w-4 mr-1.5" weight="bold" />
        新建计划
      </Button>
    </Link>
  );
}

export function CreateFirstPlanLink() {
  return (
    <Link href="/plans/new" className="mt-2 inline-block">
      <Button variant="link">创建你的第一个学习计划</Button>
    </Link>
  );
}

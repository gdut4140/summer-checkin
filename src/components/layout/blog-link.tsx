"use client";

import { Globe } from "@phosphor-icons/react";
import { SocialIconLink } from "./social-icon-link";

const BLOG_URL = "https://ruan.ink/";

/**
 * 个人博客入口。动效与 GitHub 入口完全一致（共用 SocialIconLink），
 * 只是图标和文案不同。
 *
 * 用 Globe 而不是书本类图标：它一眼就是「外部网站」，而文案已经说明是博客，
 * 图标再画一本书就重复了。
 */
export function BlogLink({ className = "" }: { className?: string }) {
  return (
    <SocialIconLink
      href={BLOG_URL}
      ariaLabel="访问我的博客"
      tooltip="访问博客"
      icon={<Globe className="h-5 w-5" weight="bold" />}
      className={className}
    />
  );
}

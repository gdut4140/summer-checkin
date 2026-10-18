"use client";

import { SocialIconLink } from "./social-icon-link";

const GITHUB_URL = "https://github.com/gdut4140/summer-checkin";

/** GitHub 图标：填色版，靠父级 currentColor 上色 */
function GitHubMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.96 3.22 9.16 7.69 10.65.56.1.76-.24.76-.54 0-.27-.01-.98-.02-1.93-3.13.68-3.79-1.5-3.79-1.5-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.72-1.5-2.49-.28-5.1-1.25-5.1-5.56 0-1.23.44-2.24 1.15-3.02-.12-.28-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.14.89-.25 1.84-.37 2.79-.38.95.01 1.9.13 2.79.38 2.14-1.44 3.08-1.14 3.08-1.14.61 1.55.23 2.7.11 2.98.72.78 1.15 1.79 1.15 3.02 0 4.32-2.62 5.28-5.12 5.56.4.35.76 1.03.76 2.07 0 1.5-.01 2.7-.01 3.07 0 .3.2.65.77.54C20.04 20.91 23.25 16.71 23.25 11.75 23.25 5.48 18.27.5 12 .5z" />
    </svg>
  );
}

/**
 * GitHub 入口。动效与博客入口共用 SocialIconLink，这里只提供地址、文案和图标。
 *
 * `.gh-icon-wrap` 必须保留在这个实例上：新手引导用它定位（onboarding/tour-steps.ts
 * 的 selector），挪到通用组件上会让引导指到博客图标去。
 */
export function GithubLink({ className = "" }: { className?: string }) {
  return (
    <SocialIconLink
      href={GITHUB_URL}
      ariaLabel="前往 GitHub 点亮 Star"
      tooltip="点亮 Star"
      icon={<GitHubMark />}
      className={className}
      wrapperClassName="gh-icon-wrap"
    />
  );
}

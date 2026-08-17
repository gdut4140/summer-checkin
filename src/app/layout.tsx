import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import ClickSpark from "@/components/landing/ClickSpark";
import { BackgroundVideo } from "@/components/layout/background-video";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer Checkin AI - 智能学习打卡平台",
  description: "记录假期学习之旅，用打卡、计划、数据与 AI 建立稳定的成长节奏。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <BackgroundVideo />
        {/* 墨绿蒙层 */}
        <div className="bg-video-overlay" />

        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <div className="relative z-10 flex flex-1 flex-col">
            <ClickSpark sparkColor="#d7ef83" sparkCount={8} sparkSize={10} sparkRadius={18} duration={450}>
              {children}
            </ClickSpark>
          </div>
          {/* 提示气泡置于 body 层级：不被 z-10 层叠上下文困住，保证显示在智能体弹窗之上 */}
          <Toaster closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import ClickSpark from "@/components/landing/ClickSpark";
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
        {/* 视频背景 */}
        <video
          className="bg-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src="/rain.mp4" type="video/mp4" />
        </video>
        {/* 墨绿蒙层 */}
        <div className="bg-video-overlay" />

        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ClickSpark sparkColor="#f3c969" sparkCount={8} sparkSize={10} sparkRadius={18} duration={450}>
            {children}
            <Toaster richColors closeButton />
          </ClickSpark>
        </ThemeProvider>
      </body>
    </html>
  );
}

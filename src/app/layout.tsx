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

        <div className="relative z-10 flex flex-1 flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <ClickSpark sparkColor="#d7ef83" sparkCount={8} sparkSize={10} sparkRadius={18} duration={450}>
              {children}
              <Toaster richColors closeButton />
            </ClickSpark>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI生图创作台",
  description:
    "用提示词生成图片和涂色线稿，也可以把照片转换成线稿或动漫风格，支持预览、历史记录和高清下载。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full bg-slate-50 text-slate-950"
        suppressHydrationWarning
      >
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div>
                <div className="text-lg font-semibold">AI生图创作台</div>
                <div className="hidden text-sm text-slate-500 sm:block">
                  图片生成、涂色线稿、照片转线稿与动漫化
                </div>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
                创作台
              </div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

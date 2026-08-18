import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shiguang Lab 文档",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

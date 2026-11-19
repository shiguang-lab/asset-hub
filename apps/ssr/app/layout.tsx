import { AntdRegistry } from "@ant-design/nextjs-registry";
import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import "./globals.css";
import { ThemeProvider } from "./components/theme-provider";

export const metadata: Metadata = {
  title: "知序 · AI 知识与创作",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <ThemeProvider>{children}</ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}

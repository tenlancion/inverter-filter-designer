import type { Metadata } from "next";
import "./globals.css";

const title = "FluxFilter｜逆变器滤波器参数设计";
const description = "面向两电平逆变器的 L、LC、LCL 滤波器参数计算与工程约束校核工具。";
const siteUrl = "https://tenlancion.github.io/inverter-filter-designer";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  icons: { icon: "/inverter-filter-designer/favicon.svg" },
  openGraph: { title, description, type: "website", url: siteUrl, images: [{ url: `${siteUrl}/og.png`, width: 1664, height: 935, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: [`${siteUrl}/og.png`] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

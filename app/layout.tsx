import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "力行國泰接駁車預約系統",
  description: "員工接駁車線上預約系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

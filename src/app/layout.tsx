import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gatehouse: screen a GitHub issue before your agent reads it",
  description: "Checks an issue for injected instructions, dangerous scripts and personal data, then forwards, holds or blocks it. Built on Clocked.",
};

export const viewport: Viewport = { themeColor: "#fbfbfa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

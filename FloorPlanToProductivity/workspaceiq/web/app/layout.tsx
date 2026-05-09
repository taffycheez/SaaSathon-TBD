import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkspaceIQ Cloud",
  description: "Next.js + TypeScript deployment shell for WorkspaceIQ."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

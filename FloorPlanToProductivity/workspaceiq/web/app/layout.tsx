import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkspaceIQ",
  description: "Upload a workspace image, turn it into an editable floor plan, and optimise the layout for productivity."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

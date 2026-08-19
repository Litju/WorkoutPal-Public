import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkoutPal Studio",
  description: "WorkoutPal identity, workspace, and athlete management studio",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

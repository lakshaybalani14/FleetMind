import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FleetMind - AWS IoT Fleet Monitoring",
  description: "Real-time fleet telemetry and edge automation control platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}

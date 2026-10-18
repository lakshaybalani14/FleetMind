import type { Metadata } from "next";
import PlatformIntro from "@/components/landing/PlatformIntro";

export const metadata: Metadata = {
  title: "FleetMind | Connected devices. Clearer decisions.",
  description: "Meet FleetMind: live sensor monitoring, telemetry analytics, and remote device control in one connected workspace.",
};

export default function Home() {
  return <PlatformIntro />;
}

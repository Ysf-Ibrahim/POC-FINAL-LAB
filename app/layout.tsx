import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { LabMenu } from "@/components/nav/LabMenu";
import { ControlHint } from "@/components/ui/ControlHint";
import { LabWorkspace } from "@/components/workspace/LabWorkspace";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Virtual Communication Lab", template: "%s · Virtual Communication Lab" },
  description:
    "An interactive bench with the EMONA Telecoms-Trainer 101 and the PROMAX OD-402B oscilloscope: patch the modules and watch the signals.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#eeede9",
};

/**
 * The bench lives in the root layout, so it stays mounted (leads, positions and
 * settings intact) while the route changes between the kit and the labs.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LabWorkspace />
        <LabMenu />
        <ControlHint />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

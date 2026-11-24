import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/data/store";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "CritLink — Critical Value Notification (Simulated EHR)",
  description: "Demo: in-EHR critical value notification to the covering provider with read-back and 30-minute tracking. Simulated data only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}

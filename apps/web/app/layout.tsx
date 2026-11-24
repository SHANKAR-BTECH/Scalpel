import type { Metadata } from "next";
import "./globals.css";
import { Banner } from "@/components/Banner";
import { Nav } from "@/components/Nav";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { DeskProvider } from "@/lib/desk";

export const metadata: Metadata = {
  title: "Scalpel · fraud hold desk",
  description: "A demo fraud desk for a bank: open police hold requests, hold only the traced scam money, check each hold against the rules, and print the proof. Simulation with fictional data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Marks that scripts run, so fade-ins never hide content when they do not. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-screen">
        <MotionProvider>
          <DeskProvider>
            <Banner />
            <Nav />
            <main className="relative z-[1]">
              <div className="mx-auto max-w-[1480px] px-4 sm:px-5 lg:px-6 pb-14">{children}</div>
            </main>
          </DeskProvider>
        </MotionProvider>
      </body>
    </html>
  );
}

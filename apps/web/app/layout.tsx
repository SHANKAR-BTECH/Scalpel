import type { Metadata } from "next";
import "./globals.css";
import { Banner } from "@/components/Banner";
import { Nav } from "@/components/Nav";
import { MotionProvider } from "@/components/ui/MotionProvider";

export const metadata: Metadata = {
  title: "Scalpel · right-size fraud holds",
  description: "Hold only the scam money, check every hold against the rules, and show the proof. Simulation with fictional data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Marks that scripts run, so scroll fade-ins never hide content when they do not. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-screen">
        <MotionProvider>
          <Banner />
          <Nav />
          <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-10">{children}</main>
        </MotionProvider>
      </body>
    </html>
  );
}

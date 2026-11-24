import type { Metadata } from "next";
import "./globals.css";
import { Banner } from "@/components/Banner";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Scalpel proof screens",
  description: "Hold the right amount, legally, and show the proof. Simulation with fictional data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Banner />
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

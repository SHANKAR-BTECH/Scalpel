import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Flash } from "@/components/Flash";

export const metadata: Metadata = {
  title: "Scalpel · hold the scam money, block the scam phone",
  description: "A demo product for a bank and a telecom company: follow scam money and the phones behind it, hold only the traced amount, block only the real source, and prove every step. Fictional data.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div role="note" className="border-b border-[var(--line)] bg-[var(--panel)] py-1 text-center text-[12px] muted no-print">
          Simulation with fictional people, banks and numbers. Not legal advice.
        </div>
        <Header />
        <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-6 sm:px-6">{children}</main>
        <Flash />
      </body>
    </html>
  );
}

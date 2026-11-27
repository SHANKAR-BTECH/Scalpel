import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Flash } from "@/components/Flash";
import { Motion } from "@/components/Motion";

export const metadata: Metadata = {
  title: "Scalpel · hold the scam money, block the scam phone",
  description: "A demo product for a bank and a telecom company: follow scam money and the phones behind it, hold only the traced amount, block only the real source, and prove every step. Fictional data.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <Motion>
        <Header />
        <main className="mx-auto w-full max-w-[1760px] px-4 pb-16 pt-6 sm:px-6 lg:px-10">{children}</main>
        <footer className="mx-auto w-full max-w-[1760px] px-4 pb-6 text-[12px] muted sm:px-6 lg:px-10 no-print">Fictional people, banks and numbers. Not legal advice.</footer>
        <Flash />
        </Motion>
      </body>
    </html>
  );
}

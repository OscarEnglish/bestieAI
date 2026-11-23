import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bestie AI - Emotionally Adaptive AI Companion",
  description: "An emotionally adaptive companion with dynamic boundaries and emotional memory.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

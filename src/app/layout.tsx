import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Google Calendar AI — Business Edition",
  description:
    "AI-Native Google Calendar for Business Users: 1-Click Clash Resolution, Protected Focus Time, Meeting Agendas, and Voice/Chat Assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}

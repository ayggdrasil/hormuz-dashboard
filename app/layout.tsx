import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import "@/app/globals.css";
import "leaflet/dist/leaflet.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Hormuz Dashboard",
  description: "Polymarket + regional intel dashboard for Iran, Middle East, and oil risk tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}

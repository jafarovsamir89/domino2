import type { ReactNode } from "react";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk"
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono"
});

export const metadata = {
  title: "Domino2 Admin",
  description: "Operational admin panel for Domino2"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
      <body style={bodyStyle}>{children}</body>
    </html>
  );
}

const bodyStyle = {
  margin: 0,
  minHeight: "100vh",
  fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
  background:
    "radial-gradient(circle at top left, rgba(56,189,248,0.08), transparent 32%), radial-gradient(circle at bottom right, rgba(14,165,233,0.06), transparent 28%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
  color: "#0f172a"
};

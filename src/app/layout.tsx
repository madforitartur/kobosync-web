// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#030813" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f10" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "KoboSync - Biblioteca EPUB",
  description: "Biblioteca EPUB com Google Drive, Supabase e Kobo",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KoboSync",
  },
  icons: {
    icon: [
      { url: "/favicon.ico",  sizes: "32x32",   type: "image/x-icon" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png"    },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png"    },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  other: {
    "mobile-web-app-capable":               "yes",
    "apple-mobile-web-app-capable":         "yes",
    "apple-mobile-web-app-status-bar-style":"black-translucent",
    "msapplication-TileColor":              "#1a202c",
    "msapplication-TileImage":              "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}

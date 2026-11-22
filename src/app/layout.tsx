// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";
import { AppBoot } from "@/components/AppBoot";

// Antes da primeira pintura: aplica o tema guardado (escuro / madeira da estante) para a app abrir como foi fechada, sem piscar.
const BOOT_SCRIPT = `try{var g=function(k){var v=localStorage.getItem(k);return v===null?null:JSON.parse(v)};var c=null;var w={carvalho:"#6b4f37",nogueira:"#35251b",mogno:"#2f130f",ebano:"#141417"};if(g("kobosync:view-mode")==="shelf"){c=w[g("kobosync:shelf-theme")]||w.nogueira}else if(g("kobosync:dark")===true){c="#0d0f10"}if(c){var s=document.createElement("style");s.id="kb-boot";s.textContent=":root{--color-background:"+c+"}";document.head.appendChild(s);document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})}}catch(e){}`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
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
  description: "Biblioteca EPUB com Google Drive, Firebase e Kobo",
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
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <PWARegister />
        <AppBoot />
        {children}
      </body>
    </html>
  );
}

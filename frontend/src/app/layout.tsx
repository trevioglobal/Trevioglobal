import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trevio Global — Enterprise Travel Booking Platform",
  description: "Trevio Global — all-in-one travel booking SaaS: flights, hotels & holidays. Multi-agency RBAC, CRM, payments, commission engine.",
  keywords: ["Trevio Global", "travel booking", "flight booking", "hotel booking", "travel agency software", "CRM", "Razorpay"],
  authors: [{ name: "Trevio Global" }],
  icons: {
    icon: "/trevio-logo.png",
    apple: "/trevio-logo.png",
  },
  appleWebApp: {
    capable: true,
    title: "Trevio",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#2A7BBD",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-dvh`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

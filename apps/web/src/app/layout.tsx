/**
 * apps/web/src/app/layout.tsx
 *
 * Root layout — wraps every page in the app.
 * Provides:
 *   - Global font (Inter from Google Fonts via next/font)
 *   - Dark mode CSS variable tokens (defined in globals.css)
 *   - NextAuth session provider
 *   - Consistent viewport meta tags
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/* Inter with Latin subset — variable font for optimal weight range */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Revenue Recovery Agent",
    template: "%s | Revenue Recovery",
  },
  description:
    "AI-powered revenue recovery agent — detect, diagnose, and recover revenue leaks across payment failures, checkout abandonment, subscription churn, and overdue receivables.",
  keywords: ["revenue recovery", "payment failure", "churn prevention", "Razorpay"],
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        {children}
      </body>
    </html>
  );
}

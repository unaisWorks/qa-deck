import type { Metadata, Viewport } from "next";
import "./globals.css";

// Pre-existing gap, unrelated to this PR's feature: there was no viewport
// meta tag anywhere in the app, on any page, so mobile browsers rendered
// every page at a wide desktop-assumption layout viewport (~980px) and
// scaled it down, rather than actually laying out at device width. Without
// this, "responsive down to mobile" cannot hold on any page in the site.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "QA Deck — AI-Powered Test Automation",
  description:
    "Generate test cases and automation scripts from any webpage in seconds. Supports Selenium, Playwright, and more. Works as a Chrome extension.",
  keywords: "QA automation, test generation, Selenium, Playwright, Chrome extension, AI testing",
  openGraph: {
    title: "QA Deck — AI-Powered Test Automation",
    description: "Generate test cases and automation scripts from any webpage in seconds.",
    url: "https://qadeck.com",
    siteName: "QA Deck",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QA Deck — AI-Powered Test Automation",
    description: "Generate test cases and automation scripts from any webpage in seconds.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}

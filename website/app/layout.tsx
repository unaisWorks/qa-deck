import type { Metadata } from "next";
import "./globals.css";

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

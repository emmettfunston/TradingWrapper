import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI TradingView Wrapper MVP",
  description: "Educational chart analysis wrapper with tool-calling AI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

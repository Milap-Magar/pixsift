import type { Metadata } from "next";
import { Tenor_Sans } from "next/font/google";
import "./globals.css";

const tenorSans = Tenor_Sans({
  variable: "--font-tenor-sans",
  weight: "400", 
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pixsift : Discover and download HD images",
  description: "A generic photo and video storing website along side sharing website.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${tenorSans.variable} h-full antialiased`}>
      {/* suppressHydrationWarning is here because browser extensions write
          attributes onto <body> before React hydrates — ColorZilla adds
          `cz-shortcut-listen="true"`, Grammarly and password managers add their
          own. The server HTML can't contain them, so React reports a mismatch
          for something the app doesn't control.

          It's safe because it only applies ONE LEVEL DEEP: it silences
          mismatches on this <body> element's own attributes and text, and does
          nothing for any component inside it. Real hydration bugs in the app
          still surface normally. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

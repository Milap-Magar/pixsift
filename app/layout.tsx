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
    <html
      lang="en"
      className={`${tenorSans.variable} h-full antialiased`}
      cz-shortcut-listen="true"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

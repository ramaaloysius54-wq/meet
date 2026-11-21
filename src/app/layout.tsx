import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RamaMeet — Connect • Collaborate • Grow",
  description: "Modern Enterprise Video Conference Platform powered by WebRTC & LiveKit SFU"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body className="bg-rm-bg text-rm-text antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ignyous.ai",
  description: "AI-powered website builder",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
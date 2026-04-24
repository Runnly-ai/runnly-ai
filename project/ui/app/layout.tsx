import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Runnly.AI Chat',
  description: 'Chat UI backed by Next.js API routes and your workflow backend.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

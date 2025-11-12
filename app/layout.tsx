import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import ViewportHack from '@/components/ViewportHack';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Thrive QR Chat',
  description: 'Welcome and chat experience launched via QR'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f0f10',
  viewportFit: 'cover'
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ViewportHack />
        <div className="min-h-screen">{props.children}</div>
      </body>
    </html>
  );
}




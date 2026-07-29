import type { Metadata, Viewport } from 'next';
import { Alegreya_Sans_SC, Inter } from 'next/font/google';
import './globals.css';

/**
 * Display face: small-caps humanist sans — medieval air with zero serifs (hard rule, Q14).
 */
const alegreyaSansSC = Alegreya_Sans_SC({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-alegreya-sans-sc',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TavernRPG',
  description: 'A cozy fantasy browser RPG that pretends to be an MMO.',
};

export const viewport: Viewport = {
  themeColor: '#17110c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${alegreyaSansSC.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}

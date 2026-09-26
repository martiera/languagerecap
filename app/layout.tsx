import type { Metadata } from 'next';
import { Lora } from 'next/font/google';
import './globals.css';

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-lora',
});

export const metadata: Metadata = { title: 'LanguageRecap — Make your own lessons stick', description: 'Turn notes from real language lessons into personal vocabulary and spaced-repetition review.', manifest: '/manifest.webmanifest' };
export const viewport = { themeColor: '#F6F0E4' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={lora.variable}>{children}</body></html>;
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'LanguageRecap — Make your own lessons stick', description: 'Turn notes from real language lessons into personal vocabulary and spaced-repetition review.', manifest: '/manifest.json' };
export const viewport = { themeColor: '#2E2A94' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

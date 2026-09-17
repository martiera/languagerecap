import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'LanguageRecap', description: 'Turn lesson notes into lasting language memory.', manifest: '/manifest.json' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

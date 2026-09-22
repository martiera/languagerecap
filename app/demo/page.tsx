'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/demo', { method: 'POST', credentials: 'include', cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'The demo is temporarily unavailable.');
      })
      .then(async () => {
        const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.user?.demo) throw new Error('The demo session could not be started.');
      })
      .then(() => {
        if (!active) return;
        localStorage.setItem('languagerecap-source-language', 'en');
        localStorage.setItem('languagerecap-learning-language', 'it');
        router.replace('/learn');
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : 'The demo is temporarily unavailable.');
      });
    return () => {
      active = false;
    };
  }, [router]);

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-xl px-5 py-20 text-center">
    {error ? <><h1 className="serif text-4xl font-bold">Demo unavailable</h1><p className="mt-4 text-[#e56f50]">{error}</p></> : <><div className="text-5xl">◒</div><h1 className="serif mt-6 text-4xl font-bold">Opening the live demo...</h1><p className="mt-4 text-[#6f7e76]">Loading a seeded, read-only Italian workspace.</p></>}
  </div></main>;
}

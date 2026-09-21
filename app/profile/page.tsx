'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { languages } from '@/lib/languages';
import { useRouter } from 'next/navigation';

function label(code: string) {
  const language = languages.find(item => item.code === code);
  return language ? `${language.flag} ${language.name}` : code;
}

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('it');

  useEffect(() => {
    fetch('/api/auth/me').then(async response => {
      const data = await response.json();
      if (!data.user) {
        router.replace('/login');
        return;
      }
      setEmail(data.user.email || '');
      setSource(data.user.activeSourceLanguage || 'en');
      setTarget(data.user.activeTargetLanguage || 'it');
    }).catch(() => router.replace('/login'));
  }, [router]);

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-2xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex items-center justify-between border-b border-[#173c3b22] pb-6"><Link href="/learn" className="flex items-center gap-2"><span className="text-2xl">◒</span><span className="serif text-2xl font-bold">LanguageRecap</span></Link><Link href="/learn" className="rounded-md border border-[#173c3b] px-4 py-2 text-sm font-bold text-[#173c3b]">← Dashboard</Link></header>
    <section className="panel mt-10 p-6 md:p-10"><span className="pill bg-[#b7c9ad66]">Account</span><h1 className="serif mt-5 text-4xl font-bold">Your learning context.</h1><p className="mt-4 leading-7 text-[#6f7e76]">{email}</p><p className="mt-6 text-sm text-[#6f7e76]">Your last selected recap pair is remembered here. Choose different languages whenever you parse a new lesson.</p><div className="mt-6 rounded-md border bg-[#fffaf1] p-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]">Last selected pair</p><p className="serif mt-2 text-2xl font-bold">{label(target)} <span className="mx-2 text-[#6f7e76]">→</span> {label(source)}</p></div><Link href="/learn/new-lesson" className="mt-6 inline-block rounded-md bg-[#173c3b] px-5 py-3 text-sm font-bold text-white">Parse a new lesson →</Link></section>
  </div></main>;
}

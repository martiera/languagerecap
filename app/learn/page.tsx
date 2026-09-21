'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { languages } from '@/lib/languages';
import { useRouter } from 'next/navigation';

type Stats = { lessons: number; words: number; mastered: number; due: number };

export default function LearnDashboard() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [fromLanguage, setFromLanguage] = useState('it');
  const [language, setLanguage] = useState('lv');
  const [stats, setStats] = useState<Stats>({ lessons: 0, words: 0, mastered: 0, due: 0 });

  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json()).then(data => {
      if (data.user) {
        setAuthenticated(true);
        setUserEmail(data.user.email || '');
      } else router.replace('/login');
    }).catch(() => router.replace('/login'));
    const savedFrom = localStorage.getItem('languagerecap-learning-language');
    const savedNative = localStorage.getItem('languagerecap-native-language');
    if (savedFrom) setFromLanguage(savedFrom);
    if (savedNative) setLanguage(savedNative);
  }, [router]);

  useEffect(() => {
    if (!authenticated) return;
    localStorage.setItem('languagerecap-learning-language', fromLanguage);
    localStorage.setItem('languagerecap-native-language', language);
    fetch(`/api/stats?language=${fromLanguage}`).then(response => response.json()).then(setStats).catch(() => {});
  }, [authenticated, fromLanguage, language]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const current = languages.find(item => item.code === fromLanguage);

  if (!authenticated) return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-xl px-5 py-16"><p className="text-center text-[#6f7e76]">Checking your session...</p></div></main>;

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173c3b22] pb-6">
      <Link href="/learn" className="flex items-center gap-2"><span className="text-2xl">◒</span><span className="serif text-2xl font-bold">LanguageRecap</span></Link>
      <div className="flex items-center gap-3"><span className="hidden rounded-md border border-[#173c3b22] bg-[#fffaf1] px-3 py-2 text-xs text-[#6f7e76] sm:block">{userEmail}</span><button type="button" onClick={logout} className="rounded-md border border-[#173c3b] px-3 py-2 text-xs font-bold text-[#173c3b]">Log out</button></div>
    </header>
    <section className="flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between md:py-16"><div><span className="pill bg-[#b7c9ad66]">Your learning dashboard</span><h1 className="serif mt-5 text-5xl font-bold md:text-7xl">Ready for your <i>recap?</i></h1><p className="mt-5 max-w-xl text-lg leading-8 text-[#6f7e76]">Keep your learned language active with a short, focused review.</p></div><Link href="/review" className="rounded-md bg-[#e56f50] px-6 py-4 text-center text-sm font-bold text-white shadow-[5px_5px_0_#e5b94e66]">Start recap {stats.due > 0 ? `· ${stats.due} due` : '→'}</Link></section>
    <section className="panel mb-8 p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]">Learning language</p><p className="serif mt-2 text-2xl font-bold">{current?.flag} {current?.name}</p></div><div className="flex items-center gap-2 text-xs font-bold text-[#6f7e76]"><label>Learn <select value={fromLanguage} onChange={e => setFromLanguage(e.target.value)} className="ml-2 rounded-md border bg-[#fffaf1] px-2 py-2 text-sm">{languages.map(item => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label><label>Native <select value={language} onChange={e => setLanguage(e.target.value)} className="ml-2 rounded-md border bg-[#fffaf1] px-2 py-2 text-sm">{languages.filter(item => item.code !== fromLanguage).map(item => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label></div></div></section>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['LESSONS', stats.lessons], ['WORDS', stats.words], ['MASTERED', stats.mastered], ['DUE FOR RECAP', stats.due]].map(([label, value]) => <div key={label} className="panel p-5 md:p-6"><div className="serif text-3xl font-bold md:text-4xl">{value}</div><div className="mt-2 text-[10px] font-bold tracking-[.16em] text-[#6f7e76]">{label}</div></div>)}</section>
    <nav className="mt-10 grid gap-3 sm:grid-cols-3"><Link href="/review" className="panel border-2 border-[#e56f50] p-5 transition hover:-translate-y-0.5"><span className="text-xs font-bold uppercase tracking-[.16em] text-[#e56f50]">01</span><h2 className="serif mt-3 text-2xl font-bold">Recap</h2><p className="mt-2 text-sm text-[#6f7e76]">Review words that are due today.</p></Link><Link href="/review/forms" className="panel p-5 transition hover:-translate-y-0.5"><span className="text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]">02</span><h2 className="serif mt-3 text-2xl font-bold">Forms</h2><p className="mt-2 text-sm text-[#6f7e76]">Practice deeper verb forms.</p></Link><Link href="/learn/new-lesson" className="panel p-5 transition hover:-translate-y-0.5"><span className="text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]">03</span><h2 className="serif mt-3 text-2xl font-bold">New lesson</h2><p className="mt-2 text-sm text-[#6f7e76]">Add language from fresh notes.</p></Link></nav>
    <div className="mt-8 flex flex-wrap gap-5 border-t border-[#173c3b22] pt-6 text-sm font-bold"><Link href="/stories" className="text-[#6f7e76]">Lesson stories →</Link><Link href="/learn/new-lesson" className="text-[#6f7e76]">Capture another lesson →</Link></div>
  </div></main>;
}

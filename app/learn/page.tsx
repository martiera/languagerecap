'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getLanguage, languages } from '@/lib/languages';
import { Brand } from '@/components/Brand';
import { useRouter } from 'next/navigation';

type PairStats = {
  sourceLanguage: string;
  targetLanguage: string;
  lessons: number;
  words: number;
  mastered: number;
  due: number;
  newAvailable: number;
  retentionCorrect: number;
  retentionTotal: number;
  timeSpentMs: number;
};

function languageName(code: string) {
  const language = languages.find(item => item.code === code);
  return language ? `${language.flag} ${language.name}` : code;
}

export default function LearnDashboard() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [pairs, setPairs] = useState<PairStats[]>([]);
  const [activeSource, setActiveSource] = useState('en');
  const [activeTarget, setActiveTarget] = useState('it');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json()).then(data => {
      if (!data.user) {
        router.replace('/login');
        return;
      }
      setAuthenticated(true);
      setUserEmail(data.user.email || '');
      setActiveSource(data.user.activeSourceLanguage || localStorage.getItem('languagerecap-source-language') || 'en');
      setActiveTarget(data.user.activeTargetLanguage || localStorage.getItem('languagerecap-learning-language') || 'it');
    }).catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    const rawMessage = sessionStorage.getItem('languagerecap-lesson-save');
    if (!rawMessage) return;
    sessionStorage.removeItem('languagerecap-lesson-save');
    try {
      const message = JSON.parse(rawMessage) as { saved?: unknown; skipped?: unknown };
      const saved = Number(message.saved);
      const skipped = Number(message.skipped);
      if (!Number.isInteger(saved) || saved < 0 || !Number.isInteger(skipped) || skipped < 0) return;
      setSaveMessage(`${saved} new words saved. ${skipped} existing words skipped.`);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetch('/api/stats').then(response => response.json()).then(data => {
      const nextPairs: PairStats[] = data.pairs || [];
      setPairs(nextPairs);
      const storedSource = localStorage.getItem('languagerecap-source-language');
      const storedTarget = localStorage.getItem('languagerecap-learning-language');
      const hasActive = nextPairs.some(pair => pair.sourceLanguage === activeSource && pair.targetLanguage === activeTarget);
      const storedPair = nextPairs.find(pair => pair.sourceLanguage === storedSource && pair.targetLanguage === storedTarget);
      const next = hasActive
        ? { source: activeSource, target: activeTarget }
        : storedPair
          ? { source: storedPair.sourceLanguage, target: storedPair.targetLanguage }
          : nextPairs[0]
            ? { source: nextPairs[0].sourceLanguage, target: nextPairs[0].targetLanguage }
            : undefined;
      if (next) {
        setActiveSource(next.source);
        setActiveTarget(next.target);
        localStorage.setItem('languagerecap-source-language', next.source);
        localStorage.setItem('languagerecap-learning-language', next.target);
      }
    }).catch(() => {});
  }, [authenticated, activeSource, activeTarget]);

  async function selectPair(sourceLanguage: string, targetLanguage: string) {
    setActiveSource(sourceLanguage);
    setActiveTarget(targetLanguage);
    localStorage.setItem('languagerecap-source-language', sourceLanguage);
    localStorage.setItem('languagerecap-learning-language', targetLanguage);
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceLanguage, targetLanguage }),
    });
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const activePair = useMemo(
    () => pairs.find(pair => pair.sourceLanguage === activeSource && pair.targetLanguage === activeTarget),
    [pairs, activeSource, activeTarget],
  );
  const formsAvailable = Boolean(activePair && getLanguage(activePair.targetLanguage)?.conjugationReview);

  if (!authenticated) {
    return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-xl px-5 py-16"><p className="text-center text-muted">Checking your session...</p></div></main>;
  }

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 pb-6">
      <Link href="/learn" aria-label="LanguageRecap dashboard"><Brand className="h-8 w-auto" /></Link>
      <div className="flex flex-wrap items-center justify-end gap-2"><span className="hidden rounded-md border border-ink/15 bg-surface px-3 py-2 text-xs text-muted sm:block">{userEmail}</span><Link href="/profile" className="rounded-md border border-ink px-3 py-2 text-xs font-bold text-ink">Account</Link><button type="button" onClick={logout} className="rounded-md border border-ink px-3 py-2 text-xs font-bold text-ink">Log out</button></div>
    </header>
    {saveMessage && <div role="status" className="mt-6 rounded-md border border-positive bg-accent/15 px-4 py-3 text-sm font-bold text-positive-ink">{saveMessage}</div>}
    <section className="flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between md:py-16"><div><span className="pill bg-accent/15">Your learning dashboard</span><h1 className="serif mt-5 text-5xl font-bold md:text-7xl">Ready for your <i>recap?</i></h1><p className="mt-5 max-w-xl text-lg leading-8 text-muted">Choose one of your saved language pairs and keep the learning rhythm.</p></div>{activePair ? <Link href="/review" className="rounded-md bg-ink px-6 py-4 text-center text-sm font-bold text-white shadow-[5px_5px_0_color-mix(in_srgb,var(--color-accent)_30%,transparent)]">Start recap {activePair.due > 0 ? `· ${activePair.due} due` : '→'}</Link> : <span className="rounded-md border border-ink/20 bg-paper px-6 py-4 text-center text-sm font-bold text-muted">Recap unavailable</span>}</section>
    <section><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-muted">Saved language pairs</p><h2 className="serif mt-2 text-3xl font-bold">Choose a language to recap.</h2></div><div className="grid gap-3 md:grid-cols-2">{pairs.length ? pairs.map(pair => { const selected = pair.sourceLanguage === activeSource && pair.targetLanguage === activeTarget; const retention = pair.retentionTotal ? Math.round((pair.retentionCorrect / pair.retentionTotal) * 100) : 0; const minutes = Math.round(pair.timeSpentMs / 60000); return <button type="button" key={`${pair.sourceLanguage}-${pair.targetLanguage}`} onClick={() => selectPair(pair.sourceLanguage, pair.targetLanguage)} className={`rounded-lg border p-5 text-left transition hover:-translate-y-0.5 ${selected ? 'border-2 border-accent bg-surface' : 'border-ink/15 bg-surface'}`}><div className="flex items-center justify-between"><span className="serif text-2xl font-bold">{languageName(pair.targetLanguage)} <span className="mx-2 text-muted">→</span> {languageName(pair.sourceLanguage)}</span><span className="text-xs font-bold text-accent">{selected ? 'Selected' : 'Select'}</span></div><div className="mt-5 grid grid-cols-4 gap-2 text-center"><span><strong className="block text-xl">{pair.lessons}</strong><small className="text-[10px] text-muted">LESSONS</small></span><span><strong className="block text-xl">{pair.words}</strong><small className="text-[10px] text-muted">WORDS</small></span><span><strong className="block text-xl">{pair.mastered}</strong><small className="text-[10px] text-muted">LEARNED</small></span><span><strong className="block text-xl">{pair.due}</strong><small className="text-[10px] text-muted">DUE</small></span></div>{selected && <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center"><span><strong className="block text-lg">{pair.newAvailable}</strong><small className="text-[10px] text-muted">NEW AVAILABLE</small></span><span><strong className="block text-lg">{retention}%</strong><small className="text-[10px] text-muted">30-DAY RETENTION</small></span><span><strong className="block text-lg">{minutes}m</strong><small className="text-[10px] text-muted">TIME SPENT</small></span></div>}</button>; }) : <div className="panel p-6 text-muted">Add a lesson to create a recap dictionary.</div>}</div></section>
    <nav className="mt-10 grid gap-3 sm:grid-cols-3">{activePair ? <Link href="/review" className="group rounded-lg border-2 border-accent bg-ink p-5 text-white shadow-[4px_4px_0_color-mix(in_srgb,var(--color-accent)_30%,transparent)] transition hover:-translate-y-0.5"><span className="text-xs font-bold uppercase tracking-[.16em] text-white/80">Open activity</span><h2 className="serif mt-3 text-2xl font-bold">Recap →</h2><p className="mt-2 text-sm text-white/80">Review {languageName(activeTarget)} words.</p></Link> : <div aria-disabled="true" className="cursor-not-allowed rounded-lg border-2 border-ink/15 bg-paper p-5 text-muted"><span className="text-xs font-bold uppercase tracking-[.16em]">Unavailable</span><h2 className="serif mt-3 text-2xl font-bold">Recap</h2><p className="mt-2 text-sm">Add a lesson to create a recap dictionary.</p></div>}{formsAvailable ? <Link href="/review/forms" className="rounded-lg border-2 border-ink bg-surface p-5 transition hover:-translate-y-0.5"><span className="text-xs font-bold uppercase tracking-[.16em] text-muted">Open activity</span><h2 className="serif mt-3 text-2xl font-bold">Forms →</h2><p className="mt-2 text-sm text-muted">Practice deeper verb forms.</p></Link> : <div aria-disabled="true" className="cursor-not-allowed rounded-lg border-2 border-ink/15 bg-paper p-5 text-muted"><span className="text-xs font-bold uppercase tracking-[.16em]">Unavailable</span><h2 className="serif mt-3 text-2xl font-bold">Forms</h2><p className="mt-2 text-sm">{activePair ? 'Forms are not available for this learned language yet.' : 'Forms require a saved language pair.'}</p></div>}<Link href="/learn/new-lesson" className="rounded-lg border-2 border-ink bg-surface p-5 transition hover:-translate-y-0.5"><span className="text-xs font-bold uppercase tracking-[.16em] text-muted">Open activity</span><h2 className="serif mt-3 text-2xl font-bold">New lesson →</h2><p className="mt-2 text-sm text-muted">Parse another language pair.</p></Link></nav>
    <div className="mt-8 flex flex-wrap gap-5 border-t border-ink/15 pt-6 text-sm font-bold"><Link href="/stories" className="text-muted">Lesson stories →</Link><Link href="/learn/new-lesson" className="text-muted">Capture another lesson →</Link></div>
  </div></main>;
}

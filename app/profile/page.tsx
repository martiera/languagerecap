'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { languages } from '@/lib/languages';
import { useRouter } from 'next/navigation';
import { SRS_LIMITS } from '@/lib/srs/config';

function label(code: string) {
  const language = languages.find(item => item.code === code);
  return language ? `${language.flag} ${language.name}` : code;
}

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('it');
  const [timezone, setTimezone] = useState('UTC');
  const [maxNewCardsPerDay, setMaxNewCardsPerDay] = useState<number>(SRS_LIMITS.defaultNewCardsPerDay);
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState<number>(SRS_LIMITS.defaultReviewsPerDay);
  const [diacriticsSensitive, setDiacriticsSensitive] = useState(false);
  const [typoTolerance, setTypoTolerance] = useState(1);
  const [requireArticleGender, setRequireArticleGender] = useState(true);
  const [message, setMessage] = useState('');

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
      return fetch('/api/profile');
    }).then(response => response?.json()).then(data => {
      if (!data) return;
      setTimezone(data.timezone || 'UTC');
      setMaxNewCardsPerDay(data.maxNewCardsPerDay || SRS_LIMITS.defaultNewCardsPerDay);
      setMaxReviewsPerDay(data.maxReviewsPerDay || SRS_LIMITS.defaultReviewsPerDay);
      setDiacriticsSensitive(Boolean(data.diacriticsSensitive));
      setTypoTolerance(Number(data.typoTolerance ?? 1));
      setRequireArticleGender(data.requireArticleGender !== false);
    }).catch(() => router.replace('/login'));
  }, [router]);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceLanguage: source, targetLanguage: target, timezone, maxNewCardsPerDay, maxReviewsPerDay, diacriticsSensitive, typoTolerance, requireArticleGender }),
    });
    const data = await response.json();
    setMessage(response.ok ? 'Settings saved.' : (data.error || 'Could not save settings.'));
  }

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-2xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex items-center justify-between border-b border-[#173c3b22] pb-6"><Link href="/learn" className="flex items-center gap-2"><span className="text-2xl">◒</span><span className="serif text-2xl font-bold">LanguageRecap</span></Link><Link href="/learn" className="rounded-md border border-[#173c3b] px-4 py-2 text-sm font-bold text-[#173c3b]">← Dashboard</Link></header>
    <section className="panel mt-10 p-6 md:p-10"><span className="pill bg-[#b7c9ad66]">Account</span><h1 className="serif mt-5 text-4xl font-bold">Your learning context.</h1><p className="mt-4 leading-7 text-[#6f7e76]">{email}</p><p className="mt-6 text-sm text-[#6f7e76]">Your last selected recap pair is remembered here. Choose different languages whenever you parse a new lesson.</p><div className="mt-6 rounded-md border bg-[#fffaf1] p-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]">Last selected pair</p><p className="serif mt-2 text-2xl font-bold">{label(target)} <span className="mx-2 text-[#6f7e76]">→</span> {label(source)}</p></div><form onSubmit={saveSettings} className="mt-7 border-t pt-7"><h2 className="serif text-2xl font-bold">Review settings</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-sm font-bold">Time zone<input value={timezone} onChange={event => setTimezone(event.target.value)} className="mt-2 w-full rounded-md border bg-[#fffaf1] px-3 py-2" /></label><label className="text-sm font-bold">New words/day<input type="number" min={SRS_LIMITS.minNewCardsPerDay} max={SRS_LIMITS.maxNewCardsPerDay} value={maxNewCardsPerDay} onChange={event => setMaxNewCardsPerDay(Number(event.target.value))} className="mt-2 w-full rounded-md border bg-[#fffaf1] px-3 py-2" /></label><label className="text-sm font-bold">Reviews/day<input type="number" min={SRS_LIMITS.minReviewsPerDay} max={SRS_LIMITS.maxReviewsPerDay} value={maxReviewsPerDay} onChange={event => setMaxReviewsPerDay(Number(event.target.value))} className="mt-2 w-full rounded-md border bg-[#fffaf1] px-3 py-2" /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={diacriticsSensitive} onChange={event => setDiacriticsSensitive(event.target.checked)} />Require diacritics</label><label className="text-sm font-bold">Typo tolerance<input type="number" min={0} max={2} value={typoTolerance} onChange={event => setTypoTolerance(Number(event.target.value))} className="mt-2 w-full rounded-md border bg-[#fffaf1] px-3 py-2" /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={requireArticleGender} onChange={event => setRequireArticleGender(event.target.checked)} />Require article/gender</label></div><button type="submit" className="mt-5 rounded-md bg-[#173c3b] px-5 py-3 text-sm font-bold text-white">Save settings</button>{message && <p className="mt-3 text-sm font-bold text-[#6f7e76]">{message}</p>}</form><Link href="/learn/new-lesson" className="mt-6 inline-block rounded-md bg-[#173c3b] px-5 py-3 text-sm font-bold text-white">Parse a new lesson →</Link></section>
  </div></main>;
}

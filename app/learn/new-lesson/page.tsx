'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLanguage, languages } from '@/lib/languages';
import { Brand } from '@/components/Brand';
import { useRouter } from 'next/navigation';

type Word = { targetText: string; translation: string; type: string; isIrregular?: boolean; conjugations?: unknown[] };
type Result = { vocabulary: Word[]; shortStory: string };

function Speak({ text, language }: { text: string; language: string }) {
  return <button aria-label={`Play pronunciation for ${text}`} onClick={() => {
    const locale = languages.find(item => item.code === language)?.locale || 'it-IT';
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }}>🔊</button>;
}

export default function NewLessonPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('it');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json()).then(data => {
      if (!data.user) {
        router.replace('/login');
        return;
      }
      setAuthenticated(true);
      setSourceLanguage(data.user.activeSourceLanguage || localStorage.getItem('languagerecap-source-language') || 'en');
      setTargetLanguage(data.user.activeTargetLanguage || localStorage.getItem('languagerecap-learning-language') || 'it');
    }).catch(() => router.replace('/login'));
  }, [router]);

  const source = languages.find(item => item.code === sourceLanguage) || languages[0];
  const target = languages.find(item => item.code === targetLanguage) || languages[1];

  function chooseSource(value: string) {
    setSourceLanguage(value);
    if (value === targetLanguage) setTargetLanguage(languages.find(item => item.code !== value)?.code || 'it');
  }

  function chooseTarget(value: string) {
    setTargetLanguage(value);
    if (value === sourceLanguage) setSourceLanguage(languages.find(item => item.code !== value)?.code || 'en');
  }

  async function parse() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/parse-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, sourceLanguage, targetLanguage, extractConjugations: getLanguage(targetLanguage)?.conjugationReview === true }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setResult(data);
      setSelected(data.vocabulary.map((_: Word, index: number) => index));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not parse notes.');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!result) return;
    setLoading(true);
    try {
      const response = await fetch('/api/words/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: result.vocabulary.filter((_, index) => selected.includes(index)),
          targetLanguage,
          sourceLanguage,
          shortStory: result.shortStory || '',
          title: `${target.name} lesson for ${source.name}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceLanguage, targetLanguage }) });
      localStorage.setItem('languagerecap-source-language', sourceLanguage);
      localStorage.setItem('languagerecap-learning-language', targetLanguage);
      sessionStorage.setItem('languagerecap-lesson-save', JSON.stringify({ saved: data.saved, skipped: data.skipped }));
      router.push('/learn');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-xl px-5 py-16"><p className="text-center text-muted">Checking your session...</p></div></main>;

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 pb-6"><div><Link href="/learn" aria-label="LanguageRecap dashboard"><Brand className="h-8 w-auto" /></Link><p className="mt-1 text-xs uppercase tracking-[.2em] text-muted">New lesson</p></div><Link href="/learn" className="rounded-md border border-ink px-4 py-2 text-sm font-bold text-ink">← Dashboard</Link></header>
    <div className="mx-auto max-w-3xl py-10 md:py-16">{!result ? <section className="panel p-6 md:p-10"><span className="pill bg-accent/15">Capture</span><h1 className="serif mt-5 text-4xl font-bold md:text-5xl">Make today&apos;s lesson <i>stick.</i></h1><p className="mt-4 leading-7 text-muted">Choose the language you are learning and the language you know for translations. The AI can work with lesson material that mixes languages.</p><div className="mt-7 rounded-md border-2 border-accent bg-surface p-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-accent">This lesson will be parsed as</p><p className="mt-2 text-lg font-bold">Learning: {target.flag} {target.name} <span className="mx-2 text-muted">→</span> Translating to: {source.flag} {source.name}</p><p className="mt-2 text-sm text-muted">The AI will identify useful {target.name} vocabulary from your lesson material and provide translations in {source.name}.</p></div><div className="mt-7 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-ink">Language you learn<select value={targetLanguage} onChange={event => chooseTarget(event.target.value)} className="mt-2 block w-full rounded-md border bg-surface px-2 py-3">{languages.filter(item => item.code !== sourceLanguage).map(item => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label><label className="block text-sm font-bold text-ink">Language you know / translate to<select value={sourceLanguage} onChange={event => chooseSource(event.target.value)} className="mt-2 block w-full rounded-md border bg-surface px-2 py-3">{languages.filter(item => item.code !== targetLanguage).map(item => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label></div><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Paste your lesson notes or material here..." className="mt-7 h-64 w-full resize-none rounded-md border bg-paper p-4 text-sm leading-6"/><button disabled={loading || notes.trim().length < 3} onClick={parse} className="mt-7 w-full rounded-md bg-ink px-5 py-4 text-sm font-bold text-white disabled:opacity-40">{loading ? 'Parsing...' : `Parse lesson for ${target.name} → ${source.name}`}</button>{message && <p className="mt-4 text-sm font-bold text-accent">{message}</p>}</section> : <section className="panel p-6 md:p-10"><div className="flex items-center justify-between"><div><span className="pill bg-accent/15">Curate</span><h1 className="serif mt-4 text-3xl font-bold">Vocabulary to remember.</h1></div><button onClick={() => setResult(null)} className="text-sm font-bold text-muted underline">Start over</button></div><div className="mt-7">{result.vocabulary.map((word, index) => <label key={`${word.targetText}-${index}`} className="flex items-center gap-3 border-b py-3"><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected(items => items.includes(index) ? items.filter(item => item !== index) : [...items, index])}/><span className="flex-1"><strong className="text-lg">{word.targetText}</strong><span className="ml-3 text-sm text-muted">{word.translation}</span><span className="ml-2 text-[10px] uppercase text-accent">{word.type}</span></span><Speak text={word.targetText} language={targetLanguage}/></label>)}<button disabled={loading || !selected.length} onClick={save} className="mt-5 rounded-md bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Save {selected.length} words</button>{message && <p className="mt-4 text-sm font-bold text-accent">{message}</p>}</div></section>}</div>
  </div></main>;
}

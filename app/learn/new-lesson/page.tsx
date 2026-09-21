'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { languages } from '@/lib/languages';
import { useRouter } from 'next/navigation';

type Word = { targetText: string; translation: string; type: string; isIrregular?: boolean; conjugations?: unknown[] };
type Result = { vocabulary: Word[] };

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
  const [fromLanguage, setFromLanguage] = useState('it');
  const [language, setLanguage] = useState('lv');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json()).then(data => {
      if (data.user) setAuthenticated(true);
      else router.replace('/login');
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
  }, [authenticated, fromLanguage, language]);

  const current = languages.find(item => item.code === fromLanguage)!;
  const native = languages.find(item => item.code === language)!;

  async function parse() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/parse-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, sourceLanguage: native.name, targetLanguage: current.name, extractConjugations: true }),
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
          targetLanguage: fromLanguage,
          sourceLanguage: language,
          shortStory: '',
          title: `${current.name} lesson`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setMessage(`${data.saved} new words saved. ${data.skipped} existing words skipped.`);
      setResult(null);
      setNotes('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-xl px-5 py-16"><p className="text-center text-[#6f7e76]">Checking your session...</p></div></main>;

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173c3b22] pb-6">
      <div><Link href="/learn" className="flex items-center gap-2"><span className="text-2xl">◒</span><span className="serif text-2xl font-bold">LanguageRecap</span></Link><p className="mt-1 text-xs uppercase tracking-[.2em] text-[#6f7e76]">New lesson</p></div>
      <Link href="/learn" className="rounded-md border border-[#173c3b] px-4 py-2 text-sm font-bold text-[#173c3b]">← Dashboard</Link>
    </header>
    <div className="mx-auto max-w-3xl py-10 md:py-16">
      {!result ? <section className="panel p-6 md:p-10"><span className="pill bg-[#e5b94e44]">Capture</span><h1 className="serif mt-5 text-4xl font-bold md:text-5xl">Make today&apos;s lesson <i>stick.</i></h1><p className="mt-4 leading-7 text-[#6f7e76]">Paste notes from class, a tutor, or real life and turn them into reviewable language.</p><div className="mt-7 flex flex-wrap items-center gap-3 text-sm font-bold text-[#6f7e76]"><label>Learning <select value={fromLanguage} onChange={e => setFromLanguage(e.target.value)} className="ml-2 rounded-md border bg-[#fffaf1] px-2 py-2">{languages.map(item => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label><span>from</span><label>Native <select value={language} onChange={e => setLanguage(e.target.value)} className="ml-2 rounded-md border bg-[#fffaf1] px-2 py-2">{languages.filter(item => item.code !== fromLanguage).map(item => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label></div><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Paste lesson notes here..." className="mt-7 h-64 w-full resize-none rounded-md border bg-[#f5f1e9] p-4 text-sm leading-6"/><button disabled={loading || notes.trim().length < 3} onClick={parse} className="mt-7 w-full rounded-md bg-[#173c3b] px-5 py-4 text-sm font-bold text-white disabled:opacity-40">{loading ? 'Parsing...' : 'Parse my notes →'}</button>{message && <p className="mt-4 text-sm font-bold text-[#e56f50]">{message}</p>}</section> : <section className="panel p-6 md:p-10"><div className="flex items-center justify-between"><div><span className="pill bg-[#b7c9ad66]">Curate</span><h1 className="serif mt-4 text-3xl font-bold">Vocabulary to remember.</h1></div><button onClick={() => setResult(null)} className="text-sm font-bold text-[#6f7e76] underline">Start over</button></div><div className="mt-7">{result.vocabulary.map((word, index) => <label key={`${word.targetText}-${index}`} className="flex items-center gap-3 border-b py-3"><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected(items => items.includes(index) ? items.filter(item => item !== index) : [...items, index])}/><span className="flex-1"><strong className="text-lg">{word.targetText}</strong><span className="ml-3 text-sm text-[#6f7e76]">{word.translation}</span><span className="ml-2 text-[10px] uppercase text-[#e56f50]">{word.type}</span></span><Speak text={word.targetText} language={fromLanguage}/></label>)}<button disabled={loading || !selected.length} onClick={save} className="mt-5 rounded-md bg-[#e56f50] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Save {selected.length} words</button>{message && <p className="mt-4 text-sm font-bold text-[#e56f50]">{message}</p>}</div></section>}
    </div>
  </div></main>;
}

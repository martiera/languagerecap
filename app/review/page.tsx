'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isRegularItalianVerb } from '@/lib/italian-conjugation';
import { languages } from '@/lib/languages';

type Form = { tense: string; person: string; form: string; translation: string };
type Word = { id: string; targetText: string; translation: string; type: string; masteryLevel: number; itemKind: 'word' | 'conjugation'; options: string[]; helperForms: Form[]; isIrregular: boolean };
type Pair = { sourceLanguage: string; targetLanguage: string; words: number };

function Split({ text, highlight }: { text: string; highlight: boolean }) {
  if (!highlight) return <span className="text-[#173c3b]">{text}</span>;
  const normalized = text.trim().toLowerCase();
  const regular = isRegularItalianVerb(normalized) || isRegularItalianVerb(normalized.replace(/si$/, ''));
  if (!regular) return <span className="text-[#173c3b]">{text}</span>;
  const match = text.match(/^(.+?)(arsi|ersi|irsi|are|ere|ire|iamo|iate|avano|avamo|avate|eranno|iranno|erete|irete|eremo|iremo|o|i|a|e|ò|à|é)$/i);
  return <><span className="text-[#173c3b]">{match ? match[1] : text.slice(0, -1)}</span><span className="text-[#e56f50]">{match ? match[2] : text.slice(-1)}</span></>;
}

function pairLabel(pair: Pair) {
  const source = languages.find(item => item.code === pair.sourceLanguage);
  const target = languages.find(item => item.code === pair.targetLanguage);
  return `${target?.flag} ${target?.name || pair.targetLanguage} → ${source?.flag} ${source?.name || pair.sourceLanguage}`;
}

export default function Review() {
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('it');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [ready, setReady] = useState(false);
  const [words, setWords] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [resetting, setResetting] = useState(false);
  const word = words[index];
  const source = languages.find(item => item.code === sourceLanguage);

  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json()).then(data => {
      setSourceLanguage(data.user?.activeSourceLanguage || localStorage.getItem('languagerecap-source-language') || 'en');
      setTargetLanguage(data.user?.activeTargetLanguage || localStorage.getItem('languagerecap-learning-language') || 'it');
      const mutedValue = localStorage.getItem('languagerecap-review-muted');
      if (mutedValue) setMuted(mutedValue === 'true');
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetch('/api/stats').then(response => response.json()).then(data => setPairs(data.pairs || []));
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    fetch(`/api/words/review?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}`).then(response => response.json()).then(data => {
      setWords(data.words || []);
      setIndex(0);
      setFeedback('');
    }).finally(() => setLoading(false));
  }, [sourceLanguage, targetLanguage, ready]);

  useEffect(() => {
    speechSynthesis.cancel();
    if (!word || muted) return;
    const locale = languages.find(item => item.code === targetLanguage)?.locale || 'it-IT';
    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(word.targetText);
      utterance.lang = locale;
      speechSynthesis.speak(utterance);
    };
    if (speechSynthesis.getVoices().length) speak();
    else speechSynthesis.onvoiceschanged = speak;
    return () => { speechSynthesis.cancel(); speechSynthesis.onvoiceschanged = null; };
  }, [word, targetLanguage, muted]);

  async function selectPair(value: string) {
    const pair = pairs.find(item => `${item.sourceLanguage}:${item.targetLanguage}` === value);
    if (!pair) return;
    setSourceLanguage(pair.sourceLanguage);
    setTargetLanguage(pair.targetLanguage);
    localStorage.setItem('languagerecap-source-language', pair.sourceLanguage);
    localStorage.setItem('languagerecap-learning-language', pair.targetLanguage);
    await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage }) });
  }

  function toggleMute() {
    setMuted(value => {
      const next = !value;
      localStorage.setItem('languagerecap-review-muted', String(next));
      if (next) speechSynthesis.cancel();
      return next;
    });
  }

  async function restart() {
    setResetting(true);
    const response = await fetch(`/api/words/review/reset?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}`, { method: 'POST' });
    if (response.ok) {
      const refreshed = await fetch(`/api/words/review?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}`);
      setWords((await refreshed.json()).words || []);
      setIndex(0);
      setFeedback('');
      setAnswer('');
    }
    setResetting(false);
  }

  async function submit(value: string) {
    if (!word || feedback) return;
    const correct = word.masteryLevel < 1
      ? value === word.translation
      : value.trim().toLocaleLowerCase() === word.translation.trim().toLocaleLowerCase();
    setFeedback(correct ? 'Correct. Keep the rhythm.' : 'Not quite. Resetting this word.');
    await fetch('/api/words/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wordId: word.id, itemKind: word.itemKind, isCorrect: correct }) });
    setTimeout(() => { setFeedback(''); setAnswer(''); setIndex(current => current + 1); }, 700);
  }

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-4xl px-3 py-3 sm:px-5 sm:py-6 md:px-10 md:py-9"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#173c3b22] pb-3 sm:gap-3 sm:pb-6"><Link href="/learn" className="flex items-center gap-2"><span className="text-xl sm:text-2xl">◒</span><span className="serif hidden text-2xl font-bold sm:inline">LanguageRecap</span></Link><div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2"><select aria-label="Review language pair" value={`${sourceLanguage}:${targetLanguage}`} onChange={event => selectPair(event.target.value)} className="max-w-[13rem] rounded-md border bg-[#fffaf1] px-2 py-1.5 text-xs font-bold sm:max-w-none sm:px-3 sm:py-2 sm:text-sm">{pairs.map(pair => <option key={`${pair.sourceLanguage}:${pair.targetLanguage}`} value={`${pair.sourceLanguage}:${pair.targetLanguage}`}>{pairLabel(pair)}</option>)}</select><Link href="/review/forms" className="rounded-md border bg-[#fffaf1] px-2 py-1.5 text-xs font-bold sm:px-3 sm:py-2 sm:text-sm">Forms</Link><button onClick={toggleMute} className="rounded-md border bg-[#fffaf1] px-2 py-1.5 text-xs font-bold sm:px-3 sm:py-2 sm:text-sm">{muted ? '🔇' : '🔊'}</button><button onClick={restart} disabled={resetting} className="rounded-md border border-[#e56f50] px-2 py-1.5 text-xs font-bold text-[#e56f50] sm:px-3 sm:py-2 sm:text-sm">{resetting ? '...' : 'Restart'}</button></div></header><div className="mx-auto max-w-xl py-5 sm:py-12"><Link href="/learn" className="text-xs font-bold text-[#6f7e76] sm:text-sm">← Dashboard</Link><div className="mt-4 flex items-end justify-between sm:mt-8"><div><span className="pill px-2 py-1 text-[10px] sm:px-3 sm:py-2 sm:text-xs">Recap · {pairLabel({ sourceLanguage, targetLanguage, words: 0 })}</span><h1 className="serif mt-2 text-3xl font-bold sm:mt-4 sm:text-5xl">Keep going.</h1></div>{word && <span className="text-xs font-bold text-[#6f7e76] sm:text-sm">{Math.min(index + 1, words.length)} / {words.length}</span>}</div>{loading ? <p className="mt-10 text-sm text-[#6f7e76]">Loading...</p> : !pairs.length ? <section className="panel mt-5 p-6 text-center sm:mt-10 sm:p-10"><h2 className="serif text-2xl font-bold sm:text-3xl">No recap dictionaries yet.</h2><p className="mt-3 text-sm text-[#6f7e76]">Parse and save a lesson first.</p></section> : !word ? <section className="panel mt-5 p-6 text-center sm:mt-10 sm:p-10"><h2 className="serif text-2xl font-bold sm:text-3xl">You&apos;re all caught up.</h2><p className="mt-3 text-sm text-[#6f7e76]">Use Restart to practice again.</p></section> : <section className="panel mt-5 p-4 sm:mt-10 sm:p-7 md:p-10"><div className="flex justify-between text-[10px] font-bold uppercase tracking-[.12em] text-[#6f7e76] sm:text-xs sm:tracking-[.16em]"><span>{word.masteryLevel < 1 ? 'Choose translation' : `Type translation in ${source?.name || sourceLanguage}`}</span><span>Level {word.masteryLevel}</span></div><div className="py-8 text-center sm:py-14"><p className="serif text-4xl font-bold sm:text-5xl"><Split text={word.targetText} highlight={word.type.toLowerCase() === 'verb'} /></p><p className="mt-2 text-sm text-[#6f7e76] sm:mt-3">{word.type}</p></div>{word.masteryLevel < 1 ? <div className="grid gap-2 sm:gap-3">{word.options.map((option, i) => <button key={option} onClick={() => submit(option)} className="rounded-md border bg-[#f5f1e9] px-3 py-3 text-left text-sm font-bold sm:px-4 sm:py-4">{String.fromCharCode(65 + i)} <span className="ml-2 sm:ml-3">{option}</span></button>)}</div> : <div><input autoFocus value={answer} onChange={event => setAnswer(event.target.value)} onKeyDown={event => event.key === 'Enter' && submit(answer)} placeholder={`Type the ${source?.name || sourceLanguage} translation...`} className="w-full rounded-md border bg-[#f5f1e9] px-3 py-3 text-sm sm:px-4 sm:py-4" /><button onClick={() => submit(answer)} className="mt-2 w-full rounded-md bg-[#173c3b] px-3 py-3 text-sm font-bold text-white sm:mt-3 sm:px-4 sm:py-4">Check</button></div>}{feedback && <p className={`mt-4 text-center text-sm font-bold ${feedback.startsWith('Correct') ? 'text-[#5b8555]' : 'text-[#e56f50]'}`}>{feedback}</p>}</section>}</div></div></main>;
}

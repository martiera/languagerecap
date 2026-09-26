'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isRegularItalianVerb } from '@/lib/italian-conjugation';
import { languages } from '@/lib/languages';
import { Brand } from '@/components/Brand';

type Form = { tense: string; person: string; form: string; translation: string };
type Word = { id: string; targetText: string; translation: string; type: string; masteryLevel: number; modeTier: number; reps: number; cardType: 'recognition' | 'production' | 'cloze'; itemKind: 'word' | 'conjugation'; options: string[]; helperForms: Form[]; isIrregular: boolean };
type Pair = { sourceLanguage: string; targetLanguage: string; words: number };
type Feedback = { correct: boolean; translation: string };
const feedbackDurationMs = 1200;

function Split({ text, highlight }: { text: string; highlight: boolean }) {
  if (!highlight) return <span className="text-ink">{text}</span>;
  const normalized = text.trim().toLowerCase();
  const regular = isRegularItalianVerb(normalized) || isRegularItalianVerb(normalized.replace(/si$/, ''));
  if (!regular) return <span className="text-ink">{text}</span>;
  const match = text.match(/^(.+?)(arsi|ersi|irsi|are|ere|ire|iamo|iate|avano|avamo|avate|eranno|iranno|erete|irete|eremo|iremo|o|i|a|e|ò|à|é)$/i);
  return <><span className="text-ink">{match ? match[1] : text.slice(0, -1)}</span><span className="text-accent">{match ? match[2] : text.slice(-1)}</span></>;
}

function pairLabel(pair: Pair) {
  const source = languages.find(item => item.code === pair.sourceLanguage);
  const target = languages.find(item => item.code === pair.targetLanguage);
  return `${target?.flag} ${target?.name || pair.targetLanguage} → ${source?.flag} ${source?.name || pair.sourceLanguage}`;
}

export default function Review() {
  const router = useRouter();
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('it');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [ready, setReady] = useState(false);
  const [words, setWords] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [staleReviewMessage, setStaleReviewMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [muted, setMuted] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [failedCardIds, setFailedCardIds] = useState<string[]>([]);
  const [correctCardIds, setCorrectCardIds] = useState<string[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [nextDueAt, setNextDueAt] = useState<number | null>(null);
  const [reviewTimezone, setReviewTimezone] = useState('UTC');
  const [refreshKey, setRefreshKey] = useState(0);
  const word = words[index];
  const source = languages.find(item => item.code === sourceLanguage);

  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json()).then(async data => {
      const nextSourceLanguage = data.user?.activeSourceLanguage || localStorage.getItem('languagerecap-source-language') || 'en';
      const nextTargetLanguage = data.user?.activeTargetLanguage || localStorage.getItem('languagerecap-learning-language') || 'it';
      setSourceLanguage(nextSourceLanguage);
      setTargetLanguage(nextTargetLanguage);
      const mutedValue = localStorage.getItem('languagerecap-review-muted');
      if (mutedValue) setMuted(mutedValue === 'true');
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTimezone && browserTimezone !== data.user?.timezone) {
        const response = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: browserTimezone }),
        });
        if (!response.ok) console.error('Could not synchronize the browser time zone.');
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetch('/api/stats').then(response => response.json()).then(data => setPairs(data.pairs || []));
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    setLoadError('');
    let active = true;
    fetch(`/api/words/review?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}`)
      .then(async response => {
        if (response.status === 401) {
          router.replace('/login');
          return null;
        }
        if (!response.ok) throw new Error('Could not load reviews.');
        return response.json();
      })
      .then(data => {
        if (!active || !data) return;
        setWords(data.words || []);
        setNextDueAt(data.nextDueAt ? new Date(data.nextDueAt).getTime() : null);
        setReviewTimezone(data.timezone || 'UTC');
        setIndex(0);
        setFeedback(null);
        setStaleReviewMessage('');
        setSubmitError('');
        setFailedCardIds([]);
        setCorrectCardIds([]);
        setSessionComplete(false);
        setSessionStartedAt(Date.now());
        setStartedAt(Date.now());
      })
      .catch(() => {
        if (!active) return;
        setWords([]);
        setNextDueAt(null);
        setLoadError('Something went wrong loading your reviews - try again');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sourceLanguage, targetLanguage, ready, refreshKey, router]);

  useEffect(() => {
    if (!ready || words.length || nextDueAt === null) return;
    const timer = window.setTimeout(
      () => setRefreshKey(value => value + 1),
      Math.max(0, nextDueAt - Date.now()) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [nextDueAt, ready, words.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    if (!word || muted) return;
    const locale = languages.find(item => item.code === targetLanguage)?.locale || 'it-IT';
    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(word.targetText);
      utterance.lang = locale;
      synthesis.speak(utterance);
    };
    if (synthesis.getVoices().length) speak();
    else synthesis.onvoiceschanged = speak;
    return () => { synthesis.cancel(); synthesis.onvoiceschanged = null; };
  }, [word, targetLanguage, muted]);

  function toggleMute() {
    setMuted(value => {
      const next = !value;
      localStorage.setItem('languagerecap-review-muted', String(next));
      if (next && typeof window !== 'undefined') window.speechSynthesis.cancel();
      return next;
    });
  }

  async function restart() {
    setResetting(true);
    const response = await fetch(`/api/words/review/reset?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}`, { method: 'POST' });
    if (response.ok) {
      const refreshed = await fetch(`/api/words/review?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}`);
      const refreshedData = await refreshed.json();
      setWords(refreshedData.words || []);
      setNextDueAt(refreshedData.nextDueAt ? new Date(refreshedData.nextDueAt).getTime() : null);
      setReviewTimezone(refreshedData.timezone || 'UTC');
      setIndex(0);
      setFeedback(null);
      setAnswer('');
      setSessionStartedAt(Date.now());
      setStartedAt(Date.now());
    }
    setResetting(false);
  }

  async function submit(value: string) {
    if (!word || feedback || staleReviewMessage) return;
    const reviewedWord = word;
    const isSessionRetry = failedCardIds.includes(word.id) && !correctCardIds.includes(word.id);
    const response = await fetch('/api/words/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wordId: word.id,
        itemKind: word.itemKind,
        sourceLanguage,
        targetLanguage,
        userAnswer: value,
        expectedReps: reviewedWord.reps,
        responseTimeMs: Math.max(0, Date.now() - startedAt),
        sessionRetry: isSessionRetry,
        sessionStartedAt: new Date(sessionStartedAt).toISOString(),
        sessionDueIds: words.map(item => item.id),
        sessionFailedIds: failedCardIds,
        sessionCorrectIds: correctCardIds,
      }),
    });
    if (response.status === 401) {
      router.replace('/login');
      return;
    }
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409 && result.code === 'STALE_REVIEW') {
        setStaleReviewMessage("That answer didn't go through - refreshing your cards");
        setAnswer('');
        window.setTimeout(() => {
          setStaleReviewMessage('');
          setRefreshKey(current => current + 1);
        }, 900);
        return;
      }
      setSubmitError('Could not submit your answer. Please try again.');
      return;
    }
    setSubmitError('');
    const failed = result.isCorrect
      ? failedCardIds
      : Array.from(new Set([...failedCardIds, word.id]));
    const correct = result.isCorrect && failedCardIds.includes(word.id)
      ? Array.from(new Set([...correctCardIds, word.id]))
      : correctCardIds;
    setFailedCardIds(failed);
    setCorrectCardIds(correct);
    setFeedback({ correct: Boolean(result.isCorrect), translation: word.translation });
    setTimeout(() => {
      setFeedback(null);
      setAnswer('');
      const nextWordsLength = words.length + (result.isCorrect ? 0 : 1);
      const nextIndex = index + 1;
      setSessionComplete(nextIndex >= nextWordsLength && failed.every(cardId => correct.includes(cardId)));
      if (!result.isCorrect) setWords(current => [...current, reviewedWord]);
      setIndex(current => current + 1);
      setStartedAt(Date.now());
    }, feedbackDurationMs);
  }

  const nextDueLabel = nextDueAt === null ? null : new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: reviewTimezone,
  }).format(new Date(nextDueAt));
  const completionMessage = failedCardIds.length > 0
    ? 'Every failed card received a correct retry.'
    : 'All cards were answered correctly.';
  if (loadError && !loading) {
    return <main className="shell grid-paper min-h-screen">
      <div className="mx-auto max-w-4xl px-3 py-3 sm:px-5 sm:py-6 md:px-10 md:py-9">
        <header className="flex items-center justify-between border-b border-ink/15 pb-3 sm:pb-6">
          <Link href="/learn" aria-label="LanguageRecap dashboard"><Brand className="h-7 w-auto sm:h-8" /></Link>
          <button onClick={toggleMute} className="rounded-md border bg-surface px-2 py-1.5 text-xs font-bold sm:px-3 sm:py-2 sm:text-sm">{muted ? '🔇' : '🔊'}</button>
        </header>
        <div className="mx-auto max-w-xl py-5 sm:py-12">
          <Link href="/learn" className="text-xs font-bold text-muted sm:text-sm">← Dashboard</Link>
          <div className="mt-4 sm:mt-8">
            <span className="pill px-2 py-1 text-[10px] sm:px-3 sm:py-2 sm:text-xs">Recap · {pairLabel({ sourceLanguage, targetLanguage, words: 0 })}</span>
            <h1 className="serif mt-2 text-3xl font-bold sm:mt-4 sm:text-5xl">Reviews unavailable.</h1>
          </div>
          <section role="alert" className="panel mt-5 p-6 text-center sm:mt-10 sm:p-10">
            <p className="text-sm text-muted">{loadError}</p>
            <button type="button" onClick={() => { setLoading(true); setRefreshKey(current => current + 1); }} className="mt-5 rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">Try again</button>
          </section>
        </div>
      </div>
    </main>;
  }

  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-4xl px-3 py-3 sm:px-5 sm:py-6 md:px-10 md:py-9"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/15 pb-3 sm:gap-3 sm:pb-6"><Link href="/learn" aria-label="LanguageRecap dashboard"><Brand className="h-7 w-auto sm:h-8" /></Link>  <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">  <button onClick={toggleMute} className="rounded-md border bg-surface px-2 py-1.5 text-xs font-bold sm:px-3 sm:py-2 sm:text-sm">{muted ? '🔇' : '🔊'}</button></div></header><div className="mx-auto max-w-xl py-5 sm:py-12"><Link href="/learn" className="text-xs font-bold text-muted sm:text-sm">← Dashboard</Link><div className="mt-4 flex items-end justify-between sm:mt-8"><div><span className="pill px-2 py-1 text-[10px] sm:px-3 sm:py-2 sm:text-xs">Recap · {pairLabel({ sourceLanguage, targetLanguage, words: 0 })}</span><h1 className="serif mt-2 text-3xl font-bold sm:mt-4 sm:text-5xl">Keep going.</h1></div>{word && <span className="text-xs font-bold text-muted sm:text-sm">{Math.min(index + 1, words.length)} / {words.length}</span>}</div>  {loading ? <p className="mt-10 text-sm text-muted">Loading...</p> : !pairs.length ? <section className="panel mt-5 p-6 text-center sm:mt-10 sm:p-10"><h2 className="serif text-2xl font-bold sm:text-3xl">No recap dictionaries yet.</h2><p className="mt-3 text-sm text-muted">Parse and save a lesson first.</p></section> : !word ? <section className="panel mt-5 p-6 text-center sm:mt-10 sm:p-10"><h2 className="serif text-2xl font-bold sm:text-3xl">{sessionComplete ? 'Session complete.' : "You're all caught up."}</h2><p className="mt-3 text-sm text-muted">{sessionComplete ? completionMessage : nextDueLabel ? `Next review at ${nextDueLabel}` : "You're all caught up."}</p></section> : <section className="panel mt-5 p-4 sm:mt-10 sm:p-7 md:p-10"><div className="flex justify-between text-[10px] font-bold uppercase tracking-[.12em] text-muted sm:text-xs sm:tracking-[.16em]"><span>{word.cardType === 'recognition' ? 'Choose translation' : `Type translation in ${source?.name || sourceLanguage}`}</span><span>Level {word.masteryLevel}</span></div><div className="py-8 text-center sm:py-14"><p className="serif text-4xl font-bold sm:text-5xl"><Split text={word.targetText} highlight={word.type.toLowerCase() === 'verb'} /></p><p className="mt-2 text-sm text-muted sm:mt-3">{word.type}</p></div>{word.cardType === 'recognition' ? <div className="grid gap-2 sm:gap-3">{word.options.map((option, i) => <button key={option} disabled={Boolean(staleReviewMessage)} onClick={() => submit(option)} className="rounded-md border bg-paper px-3 py-3 text-left text-sm font-bold sm:px-4 sm:py-4">{String.fromCharCode(65 + i)} <span className="ml-2 sm:ml-3">{option}</span></button>)}</div> : <div><input disabled={Boolean(staleReviewMessage)} autoFocus value={answer} onChange={event => setAnswer(event.target.value)} onKeyDown={event => event.key === 'Enter' && submit(answer)} placeholder={`Type the ${source?.name || sourceLanguage} translation...`} className="w-full rounded-md border bg-paper px-3 py-3 text-sm sm:px-4 sm:py-4" /><button disabled={Boolean(staleReviewMessage)} onClick={() => submit(answer)} className="mt-2 w-full rounded-md bg-ink px-3 py-3 text-sm font-bold text-white sm:mt-3 sm:px-4 sm:py-4">Check</button></div>  }{staleReviewMessage && <p role="status" className="mt-4 rounded-md border border-accent bg-accent/10 p-3 text-sm font-bold text-ink">{staleReviewMessage}</p>}{submitError && <p role="alert" className="mt-4 rounded-md border border-accent p-3 text-sm text-accent">{submitError}</p>}{feedback &&   <div className={`mt-4 rounded-md border p-3 text-sm ${feedback.correct ? 'border-positive text-positive' : 'border-accent text-accent'}`}><p className="font-bold">{feedback.correct ? 'Correct' : 'Wrong'}</p><p className="mt-1">Translation: <strong>{feedback.translation}</strong></p></div>}</section>}</div></div></main>;
}

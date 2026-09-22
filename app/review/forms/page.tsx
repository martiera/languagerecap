'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getLanguage } from '@/lib/languages';

type Form = { id: string; baseVerb: string; targetText: string; translation: string; tense: string; person: string; masteryLevel: number; learningLevel: number; context: string; options: string[]; generated: boolean; practiceMode: 'translation' | 'form-to-person' | 'person-to-form' };
type Pair = { sourceLanguage: string; targetLanguage: string };
type StageAvailability = { Present: boolean; 'Passato prossimo': boolean; Imperfetto: boolean; Future: boolean; mixed: boolean };
const tenses = [['Present', 1], ['Passato prossimo', 2], ['Imperfetto', 3], ['Future', 4], ['mixed', 5]] as const;

function pairLabel(pair: Pair) {
  const source = getLanguage(pair.sourceLanguage);
  const target = getLanguage(pair.targetLanguage);
  return `${target?.flag} ${target?.name || pair.targetLanguage} → ${source?.flag} ${source?.name || pair.sourceLanguage}`;
}

export default function FormsReview() {
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('it');
  const [tense, setTense] = useState('Present');
  const [forms, setForms] = useState<Form[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<StageAvailability>({ Present: false, 'Passato prossimo': false, Imperfetto: false, Future: false, mixed: false });
  const form = forms[index];
  const practiceMode = form?.practiceMode;
  const languageInfo = getLanguage(targetLanguage);

  const speakForm = useCallback(() => {
    if (!form || typeof window === 'undefined') return;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(form.targetText);
    utterance.lang = languageInfo?.locale || 'it-IT';
    synthesis.speak(utterance);
  }, [form, languageInfo?.locale]);

  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json()).then(data => {
      setSourceLanguage(data.user?.activeSourceLanguage || localStorage.getItem('languagerecap-source-language') || 'en');
      setTargetLanguage(data.user?.activeTargetLanguage || localStorage.getItem('languagerecap-learning-language') || 'it');
    });
  }, []);

  useEffect(() => {
    if (!languageInfo?.conjugationReview) {
      setForms([]);
      setError('Conjugation practice is not available for this learning language yet.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    fetch(`/api/words/forms-review?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}&tense=${encodeURIComponent(tense)}`, { cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the forms test.');
      return data;
    }).then(data => {
      setForms(data.forms || []);
      setAvailable(data.unlockedStages || available);
      setIndex(0);
      setFeedback('');
      setAnswer('');
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Could not load the forms test.')).finally(() => setLoading(false));
  }, [sourceLanguage, targetLanguage, tense]);

  useEffect(() => {
    if (practiceMode !== 'person-to-form') speakForm();
    return () => {
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    };
  }, [practiceMode, speakForm]);

  async function submit(value: string) {
    if (!form || feedback) return;
    try {
      if (form.generated) {
        const expected = form.practiceMode === 'form-to-person' ? form.person : form.targetText;
        setFeedback(value.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase() ? 'Correct.' : 'Not quite.');
      } else {
        const response = await fetch('/api/words/forms-review', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-present-practice': form.practiceMode === 'form-to-person' ? 'person' : 'form' }, body: JSON.stringify({ formId: form.id, answer: value, mode: tense, sourceLanguage, targetLanguage }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not update the forms test.');
        setFeedback(data.isCorrect ? 'Correct.' : 'Not quite.');
      }
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Could not update the forms test.');
      return;
    }
    if (form.practiceMode === 'person-to-form') speakForm();
    setTimeout(() => { setFeedback(''); setAnswer(''); setIndex(value => value + 1); }, 700);
  }

  return <main className="forms-review-page shell grid-paper min-h-screen"><div className="mx-auto max-w-3xl px-3 py-3 sm:px-5 sm:py-8 md:px-10"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#173c3b22] pb-3 sm:pb-6"><Link href="/learn" className="serif text-lg font-bold sm:text-2xl">LanguageRecap</Link><Link href="/learn" className="text-xs font-bold text-[#6f7e76] sm:text-sm">← Dashboard</Link></header><div className="mx-auto max-w-xl py-5 sm:py-12"><div className="flex items-center justify-between gap-2"><span className="pill px-2 py-1 text-[10px] sm:px-3 sm:py-2 sm:text-xs">Forms · {pairLabel({ sourceLanguage, targetLanguage })}</span><span className="text-xs font-bold text-[#6f7e76] sm:hidden">{form ? `${index + 1} / ${forms.length}` : ''}</span></div><h1 className="serif mt-2 text-3xl font-bold sm:mt-4 sm:text-5xl">Master the details.</h1><p className="mt-2 hidden text-[#6f7e76] sm:block">The base verb unlocks tense practice progressively.</p>{error ? <section className="panel mt-8 p-8 text-center"><h2 className="serif text-3xl font-bold">Forms practice unavailable.</h2><p className="mt-2 text-[#6f7e76]">{error}</p></section> : <><label className="mt-8 block text-sm font-bold">Practice stage<select value={tense} onChange={event => setTense(event.target.value)} className="mt-2 block w-full rounded-md border border-[#173c3b33] bg-[#fffaf1] px-3 py-3">{tenses.map(([name, level]) => <option key={name} value={name} disabled={!available[name]}>{level === 5 ? 'Level 5: Mixed tense production' : `Level ${level}: ${name}`}</option>)}</select></label>{loading ? <p className="mt-10 text-[#6f7e76]">Loading forms...</p> : !form ? <section className="panel mt-8 p-8 text-center"><h2 className="serif text-3xl font-bold">No forms ready.</h2><p className="mt-2 text-[#6f7e76]">Pass the previous learning stage to unlock this test.</p></section> : <section className="panel mt-8 p-7 md:p-10"><div className="flex justify-between text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]"><span>{tense === 'Present' ? 'Presente' : `${form.person} · ${form.tense}`}</span><span>Level {form.learningLevel}</span></div><div className="mb-4 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#6f7e76]">{form.practiceMode === 'person-to-form' && !feedback ? 'Answer to hear the conjugation' : 'Hear the conjugation'}</span><button type="button" aria-label="Play conjugation" title="Play conjugation" onClick={speakForm} disabled={form.practiceMode === 'person-to-form' && !feedback} className="text-xl transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40">🔊</button></div>{tense === 'Present' ? <><div className="mb-4 text-center"><span className="inline-block rounded-full bg-[#e5b94e66] px-3 py-1 text-xs font-bold uppercase tracking-[.12em] text-[#6f7e76]">{form.practiceMode === 'form-to-person' ? 'Pick the person' : 'Pick the form'}</span></div><div className="flex min-h-[12rem] flex-col items-center justify-center py-12 text-center">{form.practiceMode === 'form-to-person' ? <p className="serif text-5xl font-bold">{form.targetText}</p> : <><p className="serif text-3xl font-bold">{form.baseVerb}</p><p className="mt-3 text-sm font-bold uppercase tracking-[.12em] text-[#6f7e76]">{form.person}</p></>}</div></> : tense === 'mixed' ? <div className="py-12 text-center"><p className="text-sm font-bold text-[#6f7e76]">{form.context}</p><p className="serif mt-4 text-3xl font-bold">{form.translation}</p></div> : <p className="serif py-12 text-center text-5xl font-bold">{form.targetText}</p>}<div className="grid gap-3">{form.options.map((option, i) => <button key={option} onClick={() => submit(option)} className="rounded-md border border-[#173c3b22] bg-[#f5f1e9] px-4 py-4 text-left font-bold hover:border-[#e56f50]">{String.fromCharCode(65 + i)} <span className="ml-3">{option}</span></button>)}</div>{feedback && <p className={`mt-5 text-center font-bold ${feedback === 'Correct.' ? 'text-[#5b8555]' : 'text-[#e56f50]'}`}>{feedback}</p>}</section>}</>}</div></div></main>;
}

'use client';

import Link from 'next/link';
import { useState } from 'react';

const cards = [
  { target: 'andare', type: 'verb', translation: 'to go', options: ['to go', 'to be', 'the walk'] },
  { target: 'essere', type: 'verb', translation: 'to be', options: ['to need', 'to be', 'to go'] },
  { target: 'avere bisogno di', type: 'phrase', translation: 'to need', options: ['the walk', 'to need', 'to go'] },
  { target: 'la passeggiata', type: 'noun', translation: 'the walk', options: ['to be', 'the walk', 'to need'] },
  { target: 'parlare', type: 'verb', translation: 'to speak', options: ['to speak', 'to write', 'to read'] },
  { target: 'scrivere', type: 'verb', translation: 'to write', options: ['to work', 'to write', 'to see'] },
  { target: 'leggere', type: 'verb', translation: 'to read', options: ['to read', 'to open', 'to finish'] },
  { target: 'la casa', type: 'noun', translation: 'the house', options: ['the street', 'the house', 'the time'] },
  { target: 'finire', type: 'verb', translation: 'to finish', options: ['to choose', 'to finish', 'to arrive'] },
  { target: 'il lavoro', type: 'noun', translation: 'the work', options: ['the work', 'the lesson', 'the friend'] },
  { target: 'aprire', type: 'verb', translation: 'to open', options: ['to return', 'to open', 'to leave'] },
  { target: 'la lezione', type: 'noun', translation: 'the lesson', options: ['the lesson', 'the walk', 'the room'] },
  { target: 'scegliere', type: 'verb', translation: 'to choose', options: ['to choose', 'to wait', 'to speak'] },
  { target: 'arrivare', type: 'verb', translation: 'to arrive', options: ['to arrive', 'to leave', 'to take'] },
  { target: 'la strada', type: 'noun', translation: 'the street', options: ['the house', 'the street', 'the word'] },
  { target: 'partire', type: 'verb', translation: 'to leave', options: ['to leave', 'to stay', 'to return'] },
  { target: 'tornare', type: 'verb', translation: 'to return', options: ['to arrive', 'to return', 'to go'] },
  { target: 'il tempo', type: 'noun', translation: 'the time', options: ['the time', 'the work', 'the day'] },
  { target: 'aspettare', type: 'verb', translation: 'to wait', options: ['to wait', 'to listen', 'to choose'] },
  { target: 'la stanza', type: 'noun', translation: 'the room', options: ['the room', 'the street', 'the lesson'] },
  { target: 'ascoltare', type: 'verb', translation: 'to listen', options: ['to listen', 'to study', 'to write'] },
];

export default function DemoReviewPage() {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const card = cards[index];
  function answer(value: string) {
    if (feedback) return;
    setFeedback(value === card.translation ? 'Correct. Keep the rhythm.' : `The sample answer is “${card.translation}”.`);
    window.setTimeout(() => { setIndex(current => (current + 1) % cards.length); setFeedback(''); }, 700);
  }
  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-4xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex items-center justify-between border-b border-[#173c3b22] pb-6"><Link href="/demo" className="flex items-center gap-2"><span className="text-2xl">◒</span><span className="serif text-2xl font-bold">LanguageRecap</span></Link><Link href="/login?register=true" className="rounded-md bg-[#173c3b] px-4 py-2 text-sm font-bold text-white">Create account</Link></header>
    <div className="mx-auto max-w-xl py-12"><Link href="/demo" className="text-sm font-bold text-[#6f7e76]">← Demo dashboard</Link><div className="mt-8 flex items-end justify-between"><div><span className="pill bg-[#e5b94e44]">Global review · demo</span><h1 className="serif mt-4 text-5xl font-bold">Keep going.</h1></div><span className="text-sm font-bold text-[#6f7e76]">{index + 1} / {cards.length}</span></div>
      <section className="panel mt-10 p-7 md:p-10"><div className="flex justify-between text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]"><span>Choose the translation</span><span>Level 0 · {index + 1} / {cards.length}</span></div><div className="py-14 text-center"><p className="serif text-5xl font-bold">{card.target}</p><p className="mt-3 text-[#6f7e76]">{card.type}</p></div><div className="grid gap-3">{card.options.map((option, i) => <button key={option} onClick={() => answer(option)} className="rounded-md border bg-[#f5f1e9] px-4 py-4 text-left text-sm font-bold hover:border-[#e56f50]">{String.fromCharCode(65 + i)} <span className="ml-3">{option}</span></button>)}</div>{feedback && <p className={`mt-6 text-center text-sm font-bold ${feedback.startsWith('Correct') ? 'text-[#5b8555]' : 'text-[#e56f50]'}`}>{feedback}</p>}</section>
      <p className="mt-6 text-center text-xs text-[#6f7e76]">Local demo interaction. Real reviews update your personal spaced-repetition schedule.</p>
    </div>
  </div></main>;
}

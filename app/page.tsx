import Link from 'next/link';
import { Brand } from '@/components/Brand';

const steps = [
  ['01', 'Bring your lesson', 'Paste notes from class, a tutor, or real life.'],
  ['02', 'Keep what matters', 'Review the words and phrases the app finds for you.'],
  ['03', 'Remember over time', 'Return to focused spaced-repetition practice when it is useful.'],
];

export default function LandingPage() {
  return <main className="shell grid-paper min-h-screen">
    <div className="mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-9">
      <header className="flex items-center justify-between border-b border-[#173c3b22] pb-6">
        <Link href="/" aria-label="LanguageRecap home"><Brand className="h-8 w-auto" /></Link>
        <nav className="flex items-center gap-5 text-sm font-bold"><Link href="/login" className="text-[#6f7e76]">Log in</Link><Link href="/login?register=true" className="rounded-md bg-[#173c3b] px-4 py-2 text-white">Create account</Link></nav>
      </header>
      <section className="grid gap-10 py-16 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-24">
        <div><span className="pill bg-[#e5b94e44]">Italian-first language memory</span><h1 className="serif mt-6 max-w-3xl text-5xl font-bold leading-[.98] md:text-7xl">Make your own lessons <i>stick.</i></h1><p className="mt-7 max-w-xl text-lg leading-8 text-[#6f7e76]">LanguageRecap turns notes from real lessons into a personal vocabulary and spaced-repetition review system.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/demo" className="rounded-md bg-[#e56f50] px-5 py-4 text-sm font-bold text-white">Try the demo →</Link><Link href="/login?register=true" className="rounded-md border border-[#173c3b] px-5 py-4 text-sm font-bold text-[#173c3b]">Create your account</Link></div><p className="mt-4 text-xs text-[#6f7e76]">No course path to catch up with. Start with what you learned today.</p></div>
        <div className="panel rotate-1 p-6 shadow-[10px_10px_0_#e5b94e55] md:p-8"><div className="flex items-center justify-between border-b border-[#173c3b22] pb-4 text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]"><span>Today&apos;s recap</span><span className="pill bg-[#b7c9ad66]">3 due</span></div><p className="serif mt-8 text-4xl font-bold">andare</p><p className="mt-2 text-[#6f7e76]">to go</p><div className="mt-8 grid gap-2">{['I went to the market.', 'I go to class on Mondays.', 'Where are you going?'].map((text, index) => <div key={text} className={`rounded-md border p-3 text-sm ${index === 1 ? 'border-[#e56f50] bg-[#e56f5012]' : 'bg-[#f5f1e9]'}`}>{text}</div>)}</div><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]">A small review from your own lesson</p></div>
      </section>
      <section className="border-y border-[#173c3b22] py-14 md:py-20"><div className="max-w-2xl"><span className="pill bg-[#b7c9ad66]">Not another generic course</span><h2 className="serif mt-5 text-4xl font-bold md:text-5xl">The material starts with <i>your life.</i></h2><p className="mt-5 leading-7 text-[#6f7e76]">Instead of giving everyone the same sequence of flashcards, LanguageRecap helps you retain the language you actually encountered with your teacher, tutor, travels, and conversations.</p></div><div className="mt-10 grid gap-4 md:grid-cols-3">{steps.map(([number, title, text]) => <div key={number} className="border-l-2 border-[#e56f50] px-5"><span className="text-xs font-bold tracking-[.2em] text-[#e56f50]">{number}</span><h3 className="serif mt-3 text-2xl font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#6f7e76]">{text}</p></div>)}</div></section>
      <section className="flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between md:py-20"><div><h2 className="serif text-4xl font-bold">See how it feels.</h2><p className="mt-3 text-[#6f7e76]">Explore a sample Italian review without creating an account.</p></div><Link href="/demo" className="self-start rounded-md bg-[#173c3b] px-5 py-4 text-sm font-bold text-white">Open the demo →</Link></section>
      <footer className="border-t border-[#173c3b22] pt-6 text-sm text-[#6f7e76]">LanguageRecap is Italian-first today, with a foundation for more personal language learning tomorrow.</footer>
    </div>
  </main>;
}

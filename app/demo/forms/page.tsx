'use client';

import Link from 'next/link';
import { useState } from 'react';

type Stage = 'Present' | 'Passato prossimo' | 'Imperfetto' | 'Future' | 'mixed';
type DemoForm = { prompt: string; clue: string; answer: string; options: string[] };
const stages: Stage[] = ['Present', 'Passato prossimo', 'Imperfetto', 'Future', 'mixed'];
const presentData: [string, string, string, string[]][] = [
  ['andare', 'Pick the form · io', 'vado', ['vado', 'vai', 'va']],
  ['sono', 'Pick the person', 'io', ['io', 'noi', 'loro']],
  ['avere', 'Pick the form · tu', 'hai', ['ho', 'hai', 'ha']],
  ['facciamo', 'Pick the person', 'noi', ['io', 'noi', 'voi']],
  ['parlare', 'Pick the form · lei', 'parla', ['parlo', 'parli', 'parla']],
  ['scrivono', 'Pick the person', 'loro', ['lui', 'voi', 'loro']],
  ['finire', 'Pick the form · io', 'finisco', ['finisco', 'finisci', 'finisce']],
  ['bevi', 'Pick the person', 'tu', ['io', 'tu', 'lei']],
  ['studiare', 'Pick the form · noi', 'studiamo', ['studiamo', 'studiate', 'studiano']],
  ['vanno', 'Pick the person', 'loro', ['noi', 'voi', 'loro']],
  ['essere', 'Pick the form · voi', 'siete', ['sono', 'siete', 'sono']],
  ['leggi', 'Pick the person', 'tu', ['tu', 'lei', 'loro']],
  ['lavorare', 'Pick the form · loro', 'lavorano', ['lavoriamo', 'lavorate', 'lavorano']],
  ['ho', 'Pick the person', 'io', ['io', 'tu', 'lei']],
  ['aprire', 'Pick the form · lei', 'apre', ['apro', 'apri', 'apre']],
  ['dormono', 'Pick the person', 'loro', ['noi', 'voi', 'loro']],
  ['cercare', 'Pick the form · tu', 'cerchi', ['cerco', 'cerchi', 'cerca']],
  ['veniamo', 'Pick the person', 'noi', ['io', 'noi', 'loro']],
  ['ascoltare', 'Pick the form · voi', 'ascoltate', ['ascoltiamo', 'ascoltate', 'ascoltano']],
  ['dice', 'Pick the person', 'lei', ['io', 'lei', 'loro']],
];
const present: DemoForm[] = presentData.map(([prompt, clue, answer, options]) => ({ prompt, clue, answer, options }));
const later = (items: string[][]): DemoForm[] => items.map(item => ({ prompt: item[0], clue: item[1], answer: item[2], options: item.slice(3) }));
const forms: Record<Stage, DemoForm[]> = {
  Present: present,
  'Passato prossimo': later([
    ['I went · andare', 'Choose the form', 'sono andato/a', 'sono andato/a', 'andavo', 'andrò'],
    ['She was · essere', 'Choose the form', 'è stata', 'era', 'è stata', 'sarà'],
    ['We had · avere', 'Choose the form', 'abbiamo avuto', 'avevamo', 'abbiamo avuto', 'avremo'],
    ['They spoke · parlare', 'Choose the form', 'hanno parlato', 'parlavano', 'parleranno', 'hanno parlato'],
    ['I finished · finire', 'Choose the form', 'ho finito', 'finivo', 'finirò', 'ho finito'],
    ['You drank · bere', 'Choose the form', 'hai bevuto', 'bevevi', 'berrai', 'hai bevuto'],
    ['He opened · aprire', 'Choose the form', 'ha aperto', 'apriva', 'aprirà', 'ha aperto'],
    ['We studied · studiare', 'Choose the form', 'abbiamo studiato', 'studiavamo', 'studieremo', 'abbiamo studiato'],
    ['They worked · lavorare', 'Choose the form', 'hanno lavorato', 'lavoravano', 'lavoreranno', 'hanno lavorato'],
    ['I wrote · scrivere', 'Choose the form', 'ho scritto', 'scrivevo', 'scriverò', 'ho scritto'],
    ['She came · venire', 'Choose the form', 'è venuta', 'veniva', 'verrà', 'è venuta'],
    ['You read · leggere', 'Choose the form', 'hai letto', 'leggevi', 'leggerai', 'hai letto'],
    ['He said · dire', 'Choose the form', 'ha detto', 'diceva', 'dirà', 'ha detto'],
    ['We saw · vedere', 'Choose the form', 'abbiamo visto', 'vedevamo', 'vedremo', 'abbiamo visto'],
    ['They left · partire', 'Choose the form', 'sono partiti/e', 'partivano', 'partiranno', 'sono partiti/e'],
    ['I chose · scegliere', 'Choose the form', 'ho scelto', 'sceglievo', 'sceglierò', 'ho scelto'],
    ['She stayed · stare', 'Choose the form', 'è stata', 'stava', 'starà', 'è stata'],
    ['You arrived · arrivare', 'Choose the form', 'sei arrivato/a', 'arrivavi', 'arriverai', 'sei arrivato/a'],
    ['He took · prendere', 'Choose the form', 'ha preso', 'prendeva', 'prenderà', 'ha preso'],
    ['We returned · tornare', 'Choose the form', 'siamo tornati/e', 'tornavamo', 'torneremo', 'siamo tornati/e'],
  ]),
  Imperfetto: later([
    ['We used to be · essere', 'Choose the form', 'eravamo', 'eravamo', 'siamo stati', 'saremo'],
    ['I used to go · andare', 'Choose the form', 'andavo', 'sono andato/a', 'andavo', 'andrò'],
    ['She used to have · avere', 'Choose the form', 'aveva', 'ha avuto', 'aveva', 'avrà'],
    ['They used to speak · parlare', 'Choose the form', 'parlavano', 'hanno parlato', 'parlavano', 'parleranno'],
    ['You used to finish · finire', 'Choose the form', 'finivi', 'hai finito', 'finivi', 'finirai'],
    ['He used to drink · bere', 'Choose the form', 'beveva', 'ha bevuto', 'beveva', 'berrà'],
    ['We used to open · aprire', 'Choose the form', 'aprivamo', 'abbiamo aperto', 'aprivamo', 'apriremo'],
    ['I used to study · studiare', 'Choose the form', 'studiavo', 'ho studiato', 'studiavo', 'studierò'],
    ['She used to work · lavorare', 'Choose the form', 'lavorava', 'ha lavorato', 'lavorava', 'lavorerà'],
    ['They used to write · scrivere', 'Choose the form', 'scrivevano', 'hanno scritto', 'scrivevano', 'scriveranno'],
    ['You used to come · venire', 'Choose the form', 'venivi', 'sei venuto/a', 'venivi', 'verrai'],
    ['He used to read · leggere', 'Choose the form', 'leggeva', 'ha letto', 'leggeva', 'leggerà'],
    ['We used to say · dire', 'Choose the form', 'dicevamo', 'abbiamo detto', 'dicevamo', 'diremo'],
    ['I used to see · vedere', 'Choose the form', 'vedevo', 'ho visto', 'vedevo', 'vedrò'],
    ['She used to leave · partire', 'Choose the form', 'partiva', 'è partita', 'partiva', 'partirà'],
    ['They used to choose · scegliere', 'Choose the form', 'sceglievano', 'hanno scelto', 'sceglievano', 'sceglieranno'],
    ['I used to stay · stare', 'Choose the form', 'stavo', 'sono stato/a', 'stavo', 'starò'],
    ['He used to arrive · arrivare', 'Choose the form', 'arrivava', 'è arrivato', 'arrivava', 'arriverà'],
    ['We used to take · prendere', 'Choose the form', 'prendevamo', 'abbiamo preso', 'prendevamo', 'prenderemo'],
    ['You used to return · tornare', 'Choose the form', 'tornavi', 'sei tornato/a', 'tornavi', 'tornerai'],
  ]),
  Future: later([
    ['They will go · andare', 'Choose the form', 'andranno', 'andavano', 'andranno', 'sono andati'],
    ['I will be · essere', 'Choose the form', 'sarò', 'ero', 'sono stato/a', 'sarò'],
    ['You will have · avere', 'Choose the form', 'avrai', 'avevi', 'hai avuto', 'avrai'],
    ['She will speak · parlare', 'Choose the form', 'parlerà', 'parlava', 'ha parlato', 'parlerà'],
    ['We will finish · finire', 'Choose the form', 'finiremo', 'finivamo', 'abbiamo finito', 'finiremo'],
    ['He will drink · bere', 'Choose the form', 'berrà', 'beveva', 'ha bevuto', 'berrà'],
    ['They will open · aprire', 'Choose the form', 'apriranno', 'aprivano', 'hanno aperto', 'apriranno'],
    ['I will study · studiare', 'Choose the form', 'studierò', 'studiavo', 'ho studiato', 'studierò'],
    ['You will work · lavorare', 'Choose the form', 'lavorerai', 'lavoravi', 'hai lavorato', 'lavorerai'],
    ['She will write · scrivere', 'Choose the form', 'scriverà', 'scriveva', 'ha scritto', 'scriverà'],
    ['We will come · venire', 'Choose the form', 'verremo', 'venivamo', 'siamo venuti/e', 'verremo'],
    ['They will read · leggere', 'Choose the form', 'leggeranno', 'leggevano', 'hanno letto', 'leggeranno'],
    ['I will say · dire', 'Choose the form', 'dirò', 'dicevo', 'ho detto', 'dirò'],
    ['He will see · vedere', 'Choose the form', 'vedrà', 'vedeva', 'ha visto', 'vedrà'],
    ['You will leave · partire', 'Choose the form', 'partirai', 'partivi', 'sei partito/a', 'partirai'],
    ['We will choose · scegliere', 'Choose the form', 'sceglieremo', 'sceglievamo', 'abbiamo scelto', 'sceglieremo'],
    ['She will stay · stare', 'Choose the form', 'starà', 'stava', 'è stata', 'starà'],
    ['They will arrive · arrivare', 'Choose the form', 'arriveranno', 'arrivavano', 'sono arrivati/e', 'arriveranno'],
    ['I will take · prendere', 'Choose the form', 'prenderò', 'prendevo', 'ho preso', 'prenderò'],
    ['You will return · tornare', 'Choose the form', 'tornerai', 'tornavi', 'sei tornato/a', 'tornerai'],
  ]),
  mixed: later([
    ['Domani ___ a Roma. · andare', 'Choose the form', 'andrò', 'andavo', 'andrò', 'sono andato/a'],
    ['Ieri ___ molto stanco. · essere', 'Choose the form', 'sono stato/a', 'ero', 'sarò', 'sono stato/a'],
    ['Quando ero piccolo, ___ un cane. · avere', 'Choose the form', 'avevo', 'ho avuto', 'avrò', 'avevo'],
    ['La prossima settimana ___ italiano. · parlare', 'Choose the form', 'parlerò', 'parlavo', 'ho parlato', 'parlerò'],
    ['Ieri ___ il lavoro. · finire', 'Choose the form', 'ho finito', 'finivo', 'finirò', 'ho finito'],
    ['Da bambino ___ molto latte. · bere', 'Choose the form', 'bevevo', 'ho bevuto', 'berrò', 'bevevo'],
    ['Domani ___ la finestra. · aprire', 'Choose the form', 'aprirò', 'aprivo', 'ho aperto', 'aprirò'],
    ['Ogni sera ___ italiano. · studiare', 'Choose the form', 'studiavo', 'ho studiato', 'studierò', 'studiavo'],
    ['L’anno prossimo ___ a Milano. · lavorare', 'Choose the form', 'lavorerò', 'lavoravo', 'ho lavorato', 'lavorerò'],
    ['Ieri ___ una lettera. · scrivere', 'Choose the form', 'ho scritto', 'scrivevo', 'scriverò', 'ho scritto'],
    ['Domani ___ da noi. · venire', 'Choose the form', 'verrai', 'venivi', 'sei venuto/a', 'verrai'],
    ['Da giovane ___ molti libri. · leggere', 'Choose the form', 'leggevo', 'ho letto', 'leggerò', 'leggevo'],
    ['Ieri ___ la verità. · dire', 'Choose the form', 'ho detto', 'dicevo', 'dirò', 'ho detto'],
    ['Domani ___ il museo. · vedere', 'Choose the form', 'vedrò', 'vedevo', 'ho visto', 'vedrò'],
    ['La settimana scorsa ___ presto. · partire', 'Choose the form', 'sono partito/a', 'partivo', 'partirò', 'sono partito/a'],
    ['Domani ___ una decisione. · scegliere', 'Choose the form', 'sceglierò', 'sceglievo', 'ho scelto', 'sceglierò'],
    ['Ieri ___ a casa. · stare', 'Choose the form', 'sono stato/a', 'stavo', 'starò', 'sono stato/a'],
    ['Ogni giorno ___ alle otto. · arrivare', 'Choose the form', 'arrivavo', 'sono arrivato/a', 'arriverò', 'arrivavo'],
    ['Domani ___ il treno. · prendere', 'Choose the form', 'prenderò', 'prendevo', 'ho preso', 'prenderò'],
    ['Da bambino ___ spesso dai nonni. · tornare', 'Choose the form', 'tornavo', 'sono tornato/a', 'tornerò', 'tornavo'],
  ]),
};

export default function DemoFormsPage() {
  const [stage, setStage] = useState<Stage>('Present');
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const card = forms[stage][index % forms[stage].length];
  function choose(value: string) {
    if (feedback) return;
    setFeedback(value === card.answer ? 'Correct.' : `Sample answer: ${card.answer}`);
    window.setTimeout(() => { setIndex(current => current + 1); setFeedback(''); }, 700);
  }
  function changeStage(value: Stage) { setStage(value); setIndex(0); setFeedback(''); }
  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-4xl px-5 py-6 md:px-10 md:py-9">
    <header className="flex items-center justify-between border-b border-[#173c3b22] pb-6"><Link href="/" className="flex items-center gap-2"><span className="text-2xl">◒</span><span className="serif text-2xl font-bold">LanguageRecap</span></Link><Link href="/login?register=true" className="rounded-md bg-[#173c3b] px-4 py-2 text-sm font-bold text-white">Create account</Link></header>
    <div className="mx-auto max-w-xl py-12"><Link href="/demo" className="text-sm font-bold text-[#6f7e76]">← Demo dashboard</Link><span className="pill mt-8 bg-[#e5b94e44]">Verb forms · Italian · demo</span><h1 className="serif mt-4 text-5xl font-bold">Master the details.</h1><p className="mt-3 text-[#6f7e76]">The real app unlocks tense practice progressively as your base verbs become stronger.</p>
      <label className="mt-8 block text-sm font-bold">Practice stage<select value={stage} onChange={event => changeStage(event.target.value as Stage)} className="mt-2 block w-full rounded-md border border-[#173c3b33] bg-[#fffaf1] px-3 py-3">{stages.map((name, i) => <option key={name} value={name}>Level {i + 1}: {name === 'mixed' ? 'Mixed tense production' : name}</option>)}</select></label>
      <section className="panel mt-8 p-7 md:p-10"><div className="flex justify-between text-xs font-bold uppercase tracking-[.16em] text-[#6f7e76]"><span>{card.clue}</span><span>Level {stages.indexOf(stage) + 1} · {index + 1} / {forms[stage].length}</span></div><div className="py-14 text-center"><p className="serif text-4xl font-bold">{card.prompt}</p></div><div className="grid gap-3">{card.options.map((option, i) => <button key={option} onClick={() => choose(option)} className="rounded-md border bg-[#f5f1e9] px-4 py-4 text-left font-bold hover:border-[#e56f50]">{String.fromCharCode(65 + i)} <span className="ml-3">{option}</span></button>)}</div>{feedback && <p className={`mt-5 text-center font-bold ${feedback === 'Correct.' ? 'text-[#5b8555]' : 'text-[#e56f50]'}`}>{feedback}</p>}</section>
      <p className="mt-6 text-center text-xs text-[#6f7e76]">Local demo interaction. Real forms practice updates your personal progress only after you sign in.</p>
    </div>
  </div></main>;
}

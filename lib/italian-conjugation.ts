export type ItalianGeneratedForm = { tense: string; person: string; form: string; translation: string };

const irregularVerbs = new Set(['essere', 'avere', 'andare', 'fare', 'stare', 'dare', 'sapere', 'potere', 'volere', 'dovere', 'venire', 'uscire', 'dire', 'bere', 'tenere', 'rimanere', 'scegliere', 'salire', 'morire', 'tradurre', 'porre', 'venire']);

export function isRegularItalianVerb(value: string) {
  const verb = value.trim().toLocaleLowerCase();
  return (verb.endsWith('are') || verb.endsWith('ere') || verb.endsWith('ire')) && !irregularVerbs.has(verb);
}

export function generateItalianPresent(verb: string, translation: string): ItalianGeneratedForm[] {
  const normalized = verb.trim().toLocaleLowerCase();
  if (!isRegularItalianVerb(normalized)) return [];
  const ending = normalized.slice(-3);
  const stem = normalized.slice(0, -3);
  const endings = ending === 'are' ? ['o', 'i', 'a', 'iamo', 'ate', 'ano'] : ending === 'ere' ? ['o', 'i', 'e', 'iamo', 'ete', 'ono'] : ['o', 'i', 'e', 'iamo', 'ite', 'ono'];
  const people = ['io', 'tu', 'lei', 'noi', 'voi', 'loro'];
  return endings.map((formEnding, index) => ({ tense: 'Presente', person: people[index], form: stem + formEnding, translation: index === 0 ? translation : '' }));
}

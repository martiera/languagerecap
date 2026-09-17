import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { DEMO_USER_ID, pool } from '@/lib/db';
import { calculateNextReview } from '@/lib/spaced-repetition';
import { generateItalianPresent, isRegularItalianVerb } from '@/lib/italian-conjugation';
import { supportedLanguageCodes } from '@/lib/languages';

const allowedTenses = ['Present', 'Passato prossimo', 'Imperfetto', 'Future', 'mixed'];
type PresentSibling = { form: string; person: string };
type FormRow = {
  id: string;
  baseVerb: string;
  targetText: string;
  translation: string;
  tense: string;
  person: string;
  masteryLevel: number;
  learningLevel: number;
  generated: boolean;
  presentForms: PresentSibling[];
  distractors: string[];
};
function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const language = params.get('language') || 'it';
    const tense = params.get('tense') || 'Imperfetto';
    if (!supportedLanguageCodes.includes(language)) return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 });
    if (language !== 'it') return NextResponse.json({ error: 'Conjugation practice is not available for this language yet.' }, { status: 409 });
    if (!allowedTenses.includes(tense)) return NextResponse.json({ error: 'Unsupported tense.' }, { status: 400 });
    const requiredLevel = tense === 'Present' ? 1 : tense === 'Passato prossimo' ? 2 : tense === 'Imperfetto' ? 3 : tense === 'Future' ? 4 : 5;
    const parentLevel = tense === 'mixed' ? 4 : requiredLevel;
    const queryParams = tense === 'mixed' ? [DEMO_USER_ID, language, parentLevel] : [DEMO_USER_ID, language, tense, parentLevel];
    const tenseFilter = tense === 'mixed' ? '' : ' AND wc.tense ILIKE $3';
    const result = await pool.query(`SELECT uc.id, l.target_text AS "baseVerb", lc.form AS "targetText", lc.translation, lc.tense, lc.person, uc.mastery_level AS "masteryLevel", uc.learning_level AS "learningLevel", FALSE AS generated, COALESCE((SELECT json_agg(json_build_object('form', sibling.form, 'person', sibling.person)) FROM language_lexeme_conjugations sibling WHERE sibling.lexeme_id=lc.lexeme_id AND sibling.tense ILIKE 'Presente'), '[]'::json) AS "presentForms", COALESCE((SELECT array_agg(other_lc.translation) FROM language_lexeme_conjugations other_lc WHERE other_lc.lexeme_id=lc.lexeme_id AND other_lc.translation<>lc.translation LIMIT 3), ARRAY[]::text[]) AS distractors FROM user_lexeme_conjugations uc JOIN language_lexeme_conjugations lc ON lc.id=uc.conjugation_id JOIN language_lexemes l ON l.id=lc.lexeme_id JOIN user_lexemes ul ON ul.lexeme_id=l.id AND ul.user_id=uc.user_id WHERE uc.user_id=$1 AND l.language_code=$2${tenseFilter.replace('wc.tense', 'lc.tense')} AND ul.mastery_level >= $${tense === 'mixed' ? 3 : 4} AND uc.next_review_at <= NOW() ORDER BY uc.next_review_at`, queryParams);
    const generatedResult = tense === 'Present' && language === 'it' ? await pool.query<{ id: string; baseVerb: string; translation: string; masteryLevel: number }>(`SELECT ul.id, l.target_text AS "baseVerb", COALESCE(s.translation, '') AS translation, ul.mastery_level AS "masteryLevel" FROM user_lexemes ul JOIN language_lexemes l ON l.id=ul.lexeme_id LEFT JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id WHERE ul.user_id=$1 AND l.language_code=$2 AND l.grammatical_type=$3 AND l.is_irregular=FALSE AND ul.mastery_level >= $4`, [DEMO_USER_ID, language, 'verb', requiredLevel]) : { rows: [] as { id: string; baseVerb: string; translation: string; masteryLevel: number }[] };
    const generated: FormRow[] = generatedResult.rows.flatMap(word => isRegularItalianVerb(word.baseVerb) ? generateItalianPresent(word.baseVerb, word.translation).map(form => ({ id: `generated:${word.id}:${form.person}`, baseVerb: word.baseVerb, targetText: form.form, translation: word.translation, tense: form.tense, person: form.person, masteryLevel: word.masteryLevel, learningLevel: requiredLevel, generated: true, presentForms: [], distractors: [] })) : []);
    const storedForms: FormRow[] = result.rows.map(form => ({ ...form, presentForms: Array.isArray(form.presentForms) ? form.presentForms : [], distractors: Array.isArray(form.distractors) ? form.distractors : [], generated: false }));
    const forms = [...storedForms, ...generated].map((form) => { if (tense !== 'Present') { const options = [form.translation, ...form.distractors].filter((value, optionIndex, list) => value && list.indexOf(value) === optionIndex).slice(0, 3); const position = randomInt(Math.max(options.length, 1)); if (options.length > 1) { const answerIndex = options.indexOf(form.translation); const swapIndex = Math.min(position, options.length - 1); [options[answerIndex], options[swapIndex]] = [options[swapIndex], options[answerIndex]]; } return { ...form, context: `${form.person} ... (${form.baseVerb})`, practiceMode: 'translation' as const, options }; } const siblings = form.generated ? generated.filter(candidate => candidate.baseVerb === form.baseVerb).map(candidate => ({ form: candidate.targetText, person: candidate.person })) : form.presentForms; const practiceMode = randomInt(2) === 0 ? 'form-to-person' as const : 'person-to-form' as const; const answer = practiceMode === 'form-to-person' ? form.person : form.targetText; const choices = practiceMode === 'form-to-person' ? [...new Set(siblings.map(candidate => candidate.person))] : [...new Set(siblings.map(candidate => candidate.form))]; const distractors = shuffle(choices.filter(choice => choice !== answer)).slice(0, 2); const options = shuffle([answer, ...distractors]); return { ...form, context: `${form.person} ... (${form.baseVerb})`, practiceMode, options }; });
    const orderedForms = tense === 'Present' ? shuffle(forms) : forms;
    const unlocked = await pool.query('SELECT COALESCE(MAX(ul.mastery_level), 0)::int AS level FROM user_lexemes ul JOIN language_lexemes l ON l.id=ul.lexeme_id WHERE ul.user_id=$1 AND l.language_code=$2', [DEMO_USER_ID, language]);
    const currentLevel = Number(unlocked.rows[0]?.level || 0);
    return NextResponse.json({ forms: orderedForms, unlockedStages: { Present: currentLevel >= 1, 'Passato prossimo': currentLevel >= 2, Imperfetto: currentLevel >= 3, Future: currentLevel >= 4, mixed: currentLevel >= 4 } });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Could not load the forms test.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { const { formId, answer, mode, language } = await request.json(); if (typeof formId !== 'string' || typeof answer !== 'string' || !allowedTenses.includes(mode) || !supportedLanguageCodes.includes(language)) return NextResponse.json({ error: 'Invalid forms review response.' }, { status: 400 }); if (language !== 'it') return NextResponse.json({ error: 'Conjugation practice is not available for this language yet.' }, { status: 409 }); const current = await pool.query('SELECT lc.form, lc.translation, lc.person, uc.mastery_level AS "masteryLevel" FROM user_lexeme_conjugations uc JOIN language_lexeme_conjugations lc ON lc.id=uc.conjugation_id JOIN language_lexemes l ON l.id=lc.lexeme_id WHERE uc.id=$1 AND uc.user_id=$2 AND l.language_code=$3', [formId, DEMO_USER_ID, language]); if (!current.rows[0]) return NextResponse.json({ error: 'Review form not found.' }, { status: 404 }); const expected = mode === 'mixed' ? current.rows[0].form : mode === 'Present' ? (mode === 'Present' && request.headers.get('x-present-practice') === 'person' ? current.rows[0].person : current.rows[0].form) : current.rows[0].translation; const isCorrect = answer.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase(); const next = calculateNextReview(isCorrect, Number(current.rows[0].masteryLevel)); await pool.query('UPDATE user_lexeme_conjugations SET mastery_level=$1, learning_level=GREATEST(learning_level,$2), next_review_at=$3, last_reviewed_at=NOW() WHERE id=$4 AND user_id=$5', [next.masteryLevel, next.masteryLevel, next.nextReviewAt, formId, DEMO_USER_ID]); return NextResponse.json({ ...next, isCorrect }); }
  catch (error) { console.error(error); return NextResponse.json({ error: 'Could not update the forms test.' }, { status: 500 }); }
}

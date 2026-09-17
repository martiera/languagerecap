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
    const result = await pool.query(`SELECT wc.id, w.target_text AS "baseVerb", wc.form AS "targetText", wc.translation, wc.tense, wc.person, wc.mastery_level AS "masteryLevel", wc.learning_level AS "learningLevel", FALSE AS generated, COALESCE((SELECT json_agg(json_build_object('form', sibling.form, 'person', sibling.person)) FROM word_conjugations sibling WHERE sibling.word_id=wc.word_id AND sibling.tense ILIKE 'Presente'), '[]'::json) AS "presentForms", COALESCE((SELECT array_agg(other_wc.translation) FROM word_conjugations other_wc WHERE other_wc.user_id=wc.user_id AND other_wc.language_code=wc.language_code AND other_wc.translation<>wc.translation LIMIT 3), ARRAY[]::text[]) AS distractors FROM word_conjugations wc JOIN words w ON w.id=wc.word_id WHERE wc.user_id=$1 AND wc.language_code=$2${tenseFilter} AND w.mastery_level >= $${tense === 'mixed' ? 3 : 4} AND wc.next_review_at <= NOW() ORDER BY wc.next_review_at`, queryParams);
    const generatedResult = tense === 'Present' && language === 'it' ? await pool.query<{ id: string; baseVerb: string; translation: string; masteryLevel: number }>('SELECT id, target_text AS "baseVerb", translation, mastery_level AS "masteryLevel" FROM words WHERE user_id=$1 AND language_code=$2 AND grammatical_type=$3 AND is_irregular=FALSE AND mastery_level >= $4', [DEMO_USER_ID, language, 'verb', requiredLevel]) : { rows: [] as { id: string; baseVerb: string; translation: string; masteryLevel: number }[] };
    const generated: FormRow[] = generatedResult.rows.flatMap(word => isRegularItalianVerb(word.baseVerb) ? generateItalianPresent(word.baseVerb, word.translation).map(form => ({ id: `generated:${word.id}:${form.person}`, baseVerb: word.baseVerb, targetText: form.form, translation: word.translation, tense: form.tense, person: form.person, masteryLevel: word.masteryLevel, learningLevel: requiredLevel, generated: true, presentForms: [], distractors: [] })) : []);
    const storedForms: FormRow[] = result.rows.map(form => ({ ...form, presentForms: Array.isArray(form.presentForms) ? form.presentForms : [], distractors: Array.isArray(form.distractors) ? form.distractors : [], generated: false }));
    const forms = [...storedForms, ...generated].map((form) => { if (tense !== 'Present') { const options = [form.translation, ...form.distractors].filter((value, optionIndex, list) => value && list.indexOf(value) === optionIndex).slice(0, 3); const position = randomInt(Math.max(options.length, 1)); if (options.length > 1) { const answerIndex = options.indexOf(form.translation); const swapIndex = Math.min(position, options.length - 1); [options[answerIndex], options[swapIndex]] = [options[swapIndex], options[answerIndex]]; } return { ...form, context: `${form.person} ... (${form.baseVerb})`, practiceMode: 'translation' as const, options }; } const siblings = form.generated ? generated.filter(candidate => candidate.baseVerb === form.baseVerb).map(candidate => ({ form: candidate.targetText, person: candidate.person })) : form.presentForms; const practiceMode = randomInt(2) === 0 ? 'form-to-person' as const : 'person-to-form' as const; const answer = practiceMode === 'form-to-person' ? form.person : form.targetText; const choices = practiceMode === 'form-to-person' ? [...new Set(siblings.map(candidate => candidate.person))] : [...new Set(siblings.map(candidate => candidate.form))]; const distractors = shuffle(choices.filter(choice => choice !== answer)).slice(0, 2); const options = shuffle([answer, ...distractors]); return { ...form, context: `${form.person} ... (${form.baseVerb})`, practiceMode, options }; });
    const orderedForms = tense === 'Present' ? shuffle(forms) : forms;
    const unlocked = await pool.query('SELECT COALESCE(MAX(mastery_level), 0)::int AS level FROM words WHERE user_id=$1 AND language_code=$2', [DEMO_USER_ID, language]);
    const currentLevel = Number(unlocked.rows[0]?.level || 0);
    return NextResponse.json({ forms: orderedForms, unlockedStages: { Present: currentLevel >= 1, 'Passato prossimo': currentLevel >= 2, Imperfetto: currentLevel >= 3, Future: currentLevel >= 4, mixed: currentLevel >= 4 } });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Could not load the forms test.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { const { formId, answer, mode, language } = await request.json(); if (typeof formId !== 'string' || typeof answer !== 'string' || !allowedTenses.includes(mode) || !supportedLanguageCodes.includes(language)) return NextResponse.json({ error: 'Invalid forms review response.' }, { status: 400 }); if (language !== 'it') return NextResponse.json({ error: 'Conjugation practice is not available for this language yet.' }, { status: 409 }); const current = await pool.query('SELECT form, translation, person, mastery_level AS "masteryLevel" FROM word_conjugations WHERE id=$1 AND user_id=$2 AND language_code=$3', [formId, DEMO_USER_ID, language]); if (!current.rows[0]) return NextResponse.json({ error: 'Review form not found.' }, { status: 404 }); const expected = mode === 'mixed' ? current.rows[0].form : mode === 'Present' ? (mode === 'Present' && request.headers.get('x-present-practice') === 'person' ? current.rows[0].person : current.rows[0].form) : current.rows[0].translation; const isCorrect = answer.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase(); const next = calculateNextReview(isCorrect, Number(current.rows[0].masteryLevel)); await pool.query('UPDATE word_conjugations SET mastery_level=$1, learning_level=GREATEST(learning_level,$2), next_review_at=$3, last_reviewed_at=NOW() WHERE id=$4 AND user_id=$5 AND language_code=$6', [next.masteryLevel, next.masteryLevel, next.nextReviewAt, formId, DEMO_USER_ID, language]); return NextResponse.json({ ...next, isCorrect }); }
  catch (error) { console.error(error); return NextResponse.json({ error: 'Could not update the forms test.' }, { status: 500 }); }
}

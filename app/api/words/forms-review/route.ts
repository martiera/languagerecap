import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { calculateNextReview } from '@/lib/spaced-repetition';
import { generateItalianPresent, isRegularItalianVerb } from '@/lib/italian-conjugation';
import { getLanguage, supportedLanguageCodes } from '@/lib/languages';

const stageConfig: Record<string, { tenses: string[]; levels: Record<string, number> }> = {
  it: {
    tenses: ['Present', 'Passato prossimo', 'Imperfetto', 'Future', 'mixed'],
    levels: { Present: 1, 'Passato prossimo': 2, Imperfetto: 3, Future: 4, mixed: 5 },
  },
  en: {
    tenses: ['Present', 'Past', 'Future', 'mixed'],
    levels: { Present: 1, Past: 2, Future: 3, mixed: 4 },
  },
};
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
    const user = await requireUser(request);
    const params = new URL(request.url).searchParams;
    const targetLanguage = params.get('targetLanguage') || params.get('language') || 'it';
    const sourceLanguage = params.get('sourceLanguage') || 'en';
    const tense = params.get('tense') || 'Imperfetto';
    if (!supportedLanguageCodes.includes(targetLanguage) || !supportedLanguageCodes.includes(sourceLanguage) || targetLanguage === sourceLanguage) return NextResponse.json({ error: 'Choose two different supported languages.' }, { status: 400 });
    const language = getLanguage(targetLanguage);
    const config = stageConfig[targetLanguage];
    if (!language?.conjugationReview || !config) return NextResponse.json({ error: 'Conjugation practice is not available for this language yet.' }, { status: 409 });
    if (!config.tenses.includes(tense)) return NextResponse.json({ error: 'Unsupported tense.' }, { status: 400 });
    const requiredLevel = config.levels[tense];
    const parentLevel = tense === 'mixed' ? requiredLevel - 1 : requiredLevel;
    const sourceParam = tense === 'mixed' ? 4 : 5;
    const levelParam = tense === 'mixed' ? 3 : 4;
    const queryParams = tense === 'mixed' ? [user.id, targetLanguage, parentLevel, sourceLanguage] : [user.id, targetLanguage, tense, parentLevel, sourceLanguage];
    const tenseFilter = tense === 'mixed' ? '' : ' AND wc.tense ILIKE $3';
    const presentTense = targetLanguage === 'it' ? 'Presente' : 'Present';
    const result = await pool.query(`SELECT uc.id, l.target_text AS "baseVerb", lc.form AS "targetText", lc.translation, lc.tense, lc.person, uc.mastery_level AS "masteryLevel", uc.learning_level AS "learningLevel", FALSE AS generated, COALESCE((SELECT json_agg(json_build_object('form', sibling.form, 'person', sibling.person)) FROM language_lexeme_conjugations sibling WHERE sibling.lexeme_id=lc.lexeme_id AND sibling.tense ILIKE '${presentTense}'), '[]'::json) AS "presentForms", COALESCE((SELECT array_agg(other_lc.translation) FROM language_lexeme_conjugations other_lc WHERE other_lc.lexeme_id=lc.lexeme_id AND other_lc.translation<>lc.translation LIMIT 3), ARRAY[]::text[]) AS distractors FROM user_lexeme_conjugations uc JOIN language_lexeme_conjugations lc ON lc.id=uc.conjugation_id JOIN language_lexemes l ON l.id=lc.lexeme_id JOIN user_lexemes ul ON ul.lexeme_id=l.id AND ul.user_id=uc.user_id JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id WHERE uc.user_id=$1 AND l.language_code=$2 AND s.source_language_code=$${sourceParam}${tenseFilter.replace('wc.tense', 'lc.tense')} AND ul.mastery_level >= $${levelParam} AND uc.next_review_at <= NOW() ORDER BY uc.next_review_at`, queryParams);
    const generatedResult = tense === 'Present' && targetLanguage === 'it' ? await pool.query<{ id: string; baseVerb: string; translation: string; masteryLevel: number }>(`SELECT ul.id, l.target_text AS "baseVerb", s.translation, ul.mastery_level AS "masteryLevel" FROM user_lexemes ul JOIN language_lexemes l ON l.id=ul.lexeme_id JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id WHERE ul.user_id=$1 AND l.language_code=$2 AND l.grammatical_type=$3 AND l.is_irregular=FALSE AND ul.mastery_level >= $4 AND s.source_language_code=$5`, [user.id, targetLanguage, 'verb', requiredLevel, sourceLanguage]) : { rows: [] as { id: string; baseVerb: string; translation: string; masteryLevel: number }[] };
    const generated: FormRow[] = generatedResult.rows.flatMap(word => isRegularItalianVerb(word.baseVerb) ? generateItalianPresent(word.baseVerb, word.translation).map(form => ({ id: `generated:${word.id}:${form.person}`, baseVerb: word.baseVerb, targetText: form.form, translation: word.translation, tense: form.tense, person: form.person, masteryLevel: word.masteryLevel, learningLevel: requiredLevel, generated: true, presentForms: [], distractors: [] })) : []);
    const storedForms: FormRow[] = result.rows.map(form => ({ ...form, presentForms: Array.isArray(form.presentForms) ? form.presentForms : [], distractors: Array.isArray(form.distractors) ? form.distractors : [], generated: false }));
    const forms = [...storedForms, ...generated].map((form) => { if (tense !== 'Present') { const options = [form.translation, ...form.distractors].filter((value, optionIndex, list) => value && list.indexOf(value) === optionIndex).slice(0, 3); const position = randomInt(Math.max(options.length, 1)); if (options.length > 1) { const answerIndex = options.indexOf(form.translation); const swapIndex = Math.min(position, options.length - 1); [options[answerIndex], options[swapIndex]] = [options[swapIndex], options[answerIndex]]; } return { ...form, context: `${form.person} ... (${form.baseVerb})`, practiceMode: 'translation' as const, options }; } const siblings = form.generated ? generated.filter(candidate => candidate.baseVerb === form.baseVerb).map(candidate => ({ form: candidate.targetText, person: candidate.person })) : form.presentForms; const practiceMode = randomInt(2) === 0 ? 'form-to-person' as const : 'person-to-form' as const; const answer = practiceMode === 'form-to-person' ? form.person : form.targetText; const choices = practiceMode === 'form-to-person' ? [...new Set(siblings.map(candidate => candidate.person))] : [...new Set(siblings.map(candidate => candidate.form))]; const distractors = shuffle(choices.filter(choice => choice !== answer)).slice(0, 2); const options = shuffle([answer, ...distractors]); return { ...form, context: `${form.person} ... (${form.baseVerb})`, practiceMode, options }; });
    const orderedForms = tense === 'Present' ? shuffle(forms) : forms;
    const unlocked = await pool.query(`SELECT COALESCE(MAX(ul.mastery_level), 0)::int AS level FROM user_lexemes ul JOIN language_lexemes l ON l.id=ul.lexeme_id JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id WHERE ul.user_id=$1 AND l.language_code=$2 AND s.source_language_code=$3`, [user.id, targetLanguage, sourceLanguage]);
    const currentLevel = Number(unlocked.rows[0]?.level || 0);
    return NextResponse.json({ forms: orderedForms, sourceLanguage, targetLanguage, unlockedStages: Object.fromEntries(Object.entries(config.levels).map(([stage, level]) => [stage, currentLevel >= (stage === 'mixed' ? level - 1 : level)])) });
  } catch (error) { if (error instanceof Response) return error; console.error(error); return NextResponse.json({ error: 'Could not load the forms test.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { const user = await requireUser(request); const { formId, answer, mode, sourceLanguage, targetLanguage, language } = await request.json(); const selectedTarget = targetLanguage || language; const selectedSource = sourceLanguage || 'en'; if (typeof formId !== 'string' || typeof answer !== 'string' || !supportedLanguageCodes.includes(selectedTarget) || !supportedLanguageCodes.includes(selectedSource) || selectedTarget === selectedSource) return NextResponse.json({ error: 'Invalid forms review response.' }, { status: 400 });   const selectedLanguage = getLanguage(selectedTarget);
  const selectedConfig = stageConfig[selectedTarget];
  if (!selectedLanguage?.conjugationReview || !selectedConfig) return NextResponse.json({ error: 'Conjugation practice is not available for this language yet.' }, { status: 409 });
  if (!selectedConfig.tenses.includes(mode)) return NextResponse.json({ error: 'Unsupported tense.' }, { status: 400 }); const current = await pool.query('SELECT lc.form, lc.translation, lc.person, uc.mastery_level AS "masteryLevel" FROM user_lexeme_conjugations uc JOIN language_lexeme_conjugations lc ON lc.id=uc.conjugation_id JOIN language_lexemes l ON l.id=lc.lexeme_id JOIN user_lexemes ul ON ul.lexeme_id=l.id AND ul.user_id=uc.user_id JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id WHERE uc.id=$1 AND uc.user_id=$2 AND l.language_code=$3 AND s.source_language_code=$4', [formId, user.id, selectedTarget, selectedSource]); if (!current.rows[0]) return NextResponse.json({ error: 'Review form not found.' }, { status: 404 }); const expected = mode === 'mixed' ? current.rows[0].form : mode === 'Present' ? (mode === 'Present' && request.headers.get('x-present-practice') === 'person' ? current.rows[0].person : current.rows[0].form) : current.rows[0].translation; const isCorrect = answer.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase(); if (user.isDemo) return NextResponse.json({ isCorrect }); const next = calculateNextReview(isCorrect, Number(current.rows[0].masteryLevel)); await pool.query('UPDATE user_lexeme_conjugations SET mastery_level=$1, learning_level=GREATEST(learning_level,$2), next_review_at=$3, last_reviewed_at=NOW() WHERE id=$4 AND user_id=$5', [next.masteryLevel, next.masteryLevel, next.nextReviewAt, formId, user.id]); return NextResponse.json({ ...next, isCorrect }); }
  catch (error) { if (error instanceof Response) return error; console.error(error); return NextResponse.json({ error: 'Could not update the forms test.' }, { status: 500 }); }
}

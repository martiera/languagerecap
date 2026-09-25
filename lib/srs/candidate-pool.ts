import type { DistractorCandidate } from './distractors';

export type CandidatePoolRequest = {
  userId: string;
  targetLanguage: string;
  sourceLanguage: string;
  partOfSpeech?: string;
  targetLexemeId: string;
};

export const candidatePoolQuery = `
  SELECT
    l.target_text AS "targetText",
    s.translation AS text,
    l.grammatical_type AS "partOfSpeech"
  FROM user_lexemes ul
  JOIN language_lexemes l ON l.id=ul.lexeme_id
  JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
  WHERE ul.user_id=$1
    AND l.language_code=$2
    AND s.source_language_code=$3
    AND ($4::text IS NULL OR l.grammatical_type=$4)
    AND l.id <> $5
  LIMIT 50`;

export async function fetchCandidatePool(
  client: { query: (query: string, values: (string | null)[]) => Promise<{ rows: DistractorCandidate[] }> },
  request: CandidatePoolRequest,
) {
  const result = await client.query(candidatePoolQuery, [
    request.userId,
    request.targetLanguage,
    request.sourceLanguage,
    request.partOfSpeech ?? null,
    request.targetLexemeId,
  ]);
  return result.rows;
}

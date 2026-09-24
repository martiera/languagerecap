# LanguageRecap Continuation Handoff

## Project
- Repository: `/home/developer/projects/languagerecap`
- App: Next.js 15 App Router, TypeScript, Tailwind CSS, PostgreSQL via `pg`
- Runtime: Docker Compose
- App URL: `http://localhost:3000`
- Database volume: Docker named volume `languagerecap_pgdata`
- Do not run `docker compose down -v` unless intentionally deleting all DB data.

## Current Product Model
- `From` means the language being learned.
- `To` means the native/translation language.
- Current default: Italian -> Latvian.
- Supported languages: English, Italian, Spanish, French, German, Latvian, Swedish.
- Language pair is persisted in browser localStorage:
  - `languagerecap-learning-language`
  - `languagerecap-native-language`

## Database
Main tables:
- `profiles`
- `lessons`
- `words`
- `word_conjugations`

Important relationships:
- `words.lesson_id -> lessons.id ON DELETE CASCADE`
- `word_conjugations.word_id -> words.id ON DELETE CASCADE`
- `words.is_irregular BOOLEAN NOT NULL DEFAULT FALSE`
- `word_conjugations.learning_level INT NOT NULL DEFAULT 1`

Indexes:
- `words_due_idx` on `(user_id, language_code, next_review_at)`
- `conjugations_due_idx` on `(user_id, language_code, next_review_at)`
- `word_conjugations_word_id_idx` on `(word_id)`

Schema file: `lib/schema.sql`
The schema is mounted into Postgres only for fresh volumes. Later schema changes must be applied manually with `docker compose exec db psql ...`.

## Implemented API Routes
- `POST /api/parse-notes`
  - Receives `notes`, `sourceLanguage`, `targetLanguage`, `extractConjugations`.
  - Explicitly enforces source/target direction.
  - Requests whole-lesson vocabulary, no 8-12 item limit.
  - Requests irregular verb forms for present, completed past, imperfect, and future.
  - Gemini fallback: configured model first, then `gemini-3.6-flash`.
- `POST /api/words/save`
  - Saves lesson and selected base words transactionally.
  - Skips duplicate base words.
  - Stores conjugation rows only for irregular verbs.
  - Reports saved/skipped counts.
- `GET/POST /api/words/review`
  - Normal Global Review returns due base words only.
  - Multiple-choice distractors come from all saved base words in the language.
  - Answer position is randomized and responses use `Cache-Control: no-store`.
  - POST updates base-word SRS.
- `GET/POST /api/words/forms-review`
  - Separate irregular conjugation forms test.
  - Current selectable stages: Present, Passato prossimo, Imperfetto, Future, mixed.
  - Forms gated by parent base verb mastery.
  - POST updates child-form SRS.
- `POST /api/words/review/reset?language=it`
  - Resets base words and conjugations for selected language to level 0 and due now.
- `GET /api/stats?language=it`
  - Dashboard counts base `words` only, not conjugations.
- `GET /api/lessons?language=it`
  - Loads saved lesson stories and their vocabulary.

## Current UI
- `app/page.tsx`
  - Dashboard/new lesson page.
  - Source/target selectors.
  - Stats.
  - Parse notes.
  - Vocabulary selection and pronunciation.
  - Lesson Stories dashboard tab link.
  - Story is not shown after parsing by user request.
  - Verb helper is not shown after parsing by user request.
  - Irregular conjugation extraction is mandatory; no checkbox.
- `app/review/page.tsx`
  - Global base-word review.
  - Automatic pronunciation with mute control.
  - Restart review button.
  - Verb forms test link.
  - Optional irregular Verb helper.
  - Regular target words display a generic stem/ending split.
  - Correct feedback green; incorrect feedback coral.
  - Back link says `Back to dashboard`.
- `app/review/forms/page.tsx`
  - Separate forms review page with tense dropdown.
  - Current dropdown order should be Level 1 Present, Level 2 Passato prossimo, Level 3 Imperfetto, Level 4 Future, Level 5 Mixed.
- `app/stories/page.tsx`
  - Lesson Stories page with per-story speech button.

## Current Intended Learning Progression
- Level 0: recognize base verb meaning.
- Level 1: present forms, initially io/tu/lui-lei.
- Level 2: passato prossimo.
- Level 3: imperfetto.
- Level 4: future.
- Level 5: mixed-tense sentence production.

Current SRS utility: `lib/spaced-repetition.ts`
- Current levels cap at 5.
- Success intervals currently: level 1 +1 day, level 2 +2 days, level 3 +7 days, level 4 +14 days, level 5 +30 days.
- Incorrect resets to level 0 immediately.

## Regular vs Irregular Design
File: `lib/italian-conjugation.ts`
- Known irregular Italian lemma list exists.
- `isRegularItalianVerb()` detects regular infinitives ending in `are`, `ere`, `ire`, excluding known irregulars.
- `generateItalianPresent()` can generate regular forms, but current product direction is to avoid storing regular conjugation rows.
- Irregular forms are stored in `word_conjugations` and reviewed independently.
- Existing legacy child rows may still exist from before the irregular-only policy. Do not delete them without checking.

## Important Recent Database Operations
- Database was intentionally cleared previously with:
  `TRUNCATE TABLE lessons CASCADE;`
- This removed all lessons, words, and conjugations.
- Later test data was added again.
- At one verification point the Italian DB had 4 lessons and 33 base words; current contents may differ.
- Verify before destructive operations.

## Known Issues / Next Work
1. **Forms progression semantics need refinement.** The API currently gates by parent `mastery_level` and tense, but does not yet implement a fully coherent per-form stage progression matching all six levels.
2. **Level 5 mixed test direction needs correction.** It should show a sentence/context plus native-language meaning and require typing the target conjugation, not merely typing the translation.
3. **Forms test currently has hard-coded Italian and `language=it`.** Make it language-aware before supporting other languages.
4. **Gemini output needs runtime schema validation and canonicalization.** Tense/person labels currently vary (`io`, `1a persona singolare`, etc.).
5. **Save deduplication is application-level and race-prone.** Add unique database constraints/migration after cleaning duplicates.
6. **Dashboard currently sends `shortStory: ''` when saving.** This was intentional when stories were removed from post-parse UI, but it means newly generated stories are not saved. If Lesson Stories should show new stories, pass `result.shortStory` again.
7. **Generated quizzes are not persisted or displayed.**
8. **Regular Italian stem splitting is heuristic.** It should eventually be language-specific and/or use structured `stem`/`ending` from the parser.
9. **Some pages are compressed into long lines.** Prefer rewriting a file cleanly rather than fragile fragment patches.
10. **No automated test suite exists yet.**

## Validation Commands
From repository root:
```bash
docker compose config --quiet
docker compose build app
docker compose up -d --force-recreate app
curl -fsS http://localhost:3000 > /dev/null
```

Useful DB checks:
```bash
docker compose exec -T db psql -U languagerecap_admin -d languagerecap_db -c "SELECT language_code, COUNT(*) FROM words GROUP BY language_code;"
docker compose exec -T db psql -U languagerecap_admin -d languagerecap_db -c "SELECT language_code, COUNT(*) FROM lessons GROUP BY language_code;"
docker compose exec -T db psql -U languagerecap_admin -d languagerecap_db -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='word_conjugations';"
```

## Suggested Prompt For Next Chat
"Continue work in `/home/developer/projects/languagerecap` using `docs/CONTINUATION_HANDOFF.md`. First verify current files and database state. Before schema, query, language, or performance changes, read `docs/DATA_SCALE_ESTIMATES.md` and `docs/SCALABILITY.md`. The next priority is to finish the six-level irregular-verb learning progression: make base-word review advance through Levels 0-1, make selectable irregular form tests unlock in the correct order (Present, Passato prossimo, Imperfetto, Future), and implement Level 5 mixed-tense sentence production with typed target forms. Preserve the existing database and run a Docker production build after edits."

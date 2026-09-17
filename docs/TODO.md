# Prioritized TODO List

## Handoff priorities

### [x] Level 1 Present mixed-recall practice
- **File/directory:** `app/api/words/forms-review/route.ts`; `app/review/forms/page.tsx`
- **Why it matters:** Present-form practice should test person/form recognition instead of only showing one form with translation choices.
- **Suggested implementation:** Randomly alternate between form-to-person and person-to-form prompts using all six persons. Keep regular forms practice-only and preserve stored irregular SRS behavior.
- **Acceptance criteria:** All six persons can appear; both prompt directions work; regular forms do not create or update database rows; stored irregular forms continue to use their saved review state.

### [x] 0. Complete the six-level irregular-verb learning progression
- **File/directory:** `app/review/page.tsx`; `app/review/forms/page.tsx`; `app/api/words/review/route.ts`; `app/api/words/forms-review/route.ts`; `lib/spaced-repetition.ts`
- **Why it matters:** The intended progression is not yet coherent: base-word review should cover Levels 0–1, form stages should unlock in order through Level 4, and Level 5 should be mixed-tense production.
- **Suggested implementation:** Define shared level semantics, make base-word review advance through recognition levels, gate each selectable form stage using the correct parent/form state, and schedule child forms consistently with the six-level model.
- **Acceptance criteria:** Level 0 recognition and Level 1 present practice work; Present, Passato prossimo, Imperfetto, and Future unlock in order; Level 5 mixed practice is available only after the prior stages and updates SRS correctly.

### [x] 0.1. Correct Level 5 mixed-tense direction
- **File/directory:** `app/review/forms/page.tsx`; `app/api/words/forms-review/route.ts`
- **Why it matters:** Mixed practice currently asks for a translation, but the intended exercise is sentence/context plus native-language meaning requiring the target conjugation.
- **Suggested implementation:** Return a sentence/context and source-language meaning for mixed items, then validate the typed target-language conjugation against the selected form.
- **Acceptance criteria:** Mixed prompts show sufficient context and native meaning; the submitted answer is compared to the target form, not its translation; incorrect answers reset the form according to SRS rules.

### [x] 0.2. Make forms review language-aware
- **File/directory:** `app/review/forms/page.tsx`; `app/api/words/forms-review/route.ts`; shared language metadata
- **Why it matters:** The forms screen hard-codes Italian and cannot safely support the other configured learning languages.
- **Suggested implementation:** Read the persisted learning language, pass it to the API, validate supported language capabilities, and hide or clearly disable unsupported conjugation workflows.
- **Acceptance criteria:** The selected learning language drives forms requests and labels; non-Italian behavior is explicit rather than silently querying Italian data.

### [x] 0.3. Make Present review cards visually consistent
- **File/directory:** `app/review/forms/page.tsx`
- **Why it matters:** The two Present question directions should use the same visual structure without exposing the answer in the metadata.
- **Suggested implementation:** Use neutral `Presente` and level metadata, a shared colored instruction badge, and identical prompt/answer spacing. Show `Pick the person` with the conjugated form or `Pick the form` with the infinitive and persona clue.
- **Acceptance criteria:** Both directions have parallel card layouts; form-to-person does not show the persona above the prompt; person-to-form shows the persona as the clue; scoring and three-choice answers are unchanged.

## Critical bugs

### 1. Add authentication and real user isolation
- **File/directory:** `lib/db.ts`; all `app/api/**` routes; `lib/schema.sql`
- **Why it matters:** Every request uses one hard-coded demo user, so all deployed users share lessons, words, and review progress.
- **Suggested implementation:** Introduce the project’s chosen auth/session mechanism, derive the user ID server-side, add profile/user constraints and authorization checks to every query, and remove the shared fallback for production.
- **Acceptance criteria:** Unauthenticated requests are rejected or explicitly limited to demo mode; authenticated users can only read and mutate their own data; no production route relies on `DEMO_USER_ID`.

### 2. Validate Gemini responses at runtime
- **File/directory:** `app/api/parse-notes/route.ts`
- **Why it matters:** TypeScript types do not validate external JSON; malformed or oversized AI output can cause crashes or corrupt saved data.
- **Suggested implementation:** Add a runtime schema validator or explicit guards for vocabulary, conjugations, story, and quiz structure, with bounded lengths/counts and clear error responses.
- **Acceptance criteria:** Invalid, missing, or oversized model output is rejected without saving data; valid output preserves the current UI contract.

### 2.1. Canonicalize AI tense and person labels
- **File/directory:** `app/api/parse-notes/route.ts`; `app/api/words/save/route.ts`; `lib/**`
- **Why it matters:** Inconsistent labels such as `io` and `1a persona singolare` undermine filtering, helper display, and progression logic.
- **Suggested implementation:** Normalize tense/person values at the API boundary to a fixed enum and reject unsupported combinations before persistence.
- **Acceptance criteria:** Stored conjugations use canonical labels; equivalent model labels map to the same values; unsupported labels are rejected or reported.

### 3. Fix review/form API input and query correctness
- **File/directory:** `app/api/words/review/route.ts`; `app/api/words/forms-review/route.ts`; `app/api/words/review/reset/route.ts`
- **Why it matters:** Arbitrary IDs, levels, language values, and item kinds are accepted; form-stage selection does not clearly enforce `learning_level`; reset behavior reports only word row counts.
- **Suggested implementation:** Validate identifiers, booleans, levels, supported languages, and item kinds; constrain dynamic table selection; enforce the progression rules above and return accurate reset counts.
- **Acceptance criteria:** Invalid requests return 4xx responses; users cannot update unrelated records; each forms stage returns only eligible due forms; reset results accurately describe affected records.

### 4. Stop masking database failures as empty statistics
- **File/directory:** `app/api/stats/route.ts`
- **Why it matters:** A database outage appears to users as zero progress, making failures difficult to detect and potentially causing misleading decisions.
- **Suggested implementation:** Return a 5xx error with a stable error shape and update the dashboard to display an error state instead of zero defaults.
- **Acceptance criteria:** Database failures produce an error response and visible error state; genuine empty data still displays zeros.

## Missing tests

### 5. Add unit tests for spaced repetition and Italian conjugation
- **File/directory:** `lib/spaced-repetition.ts`; `lib/italian-conjugation.ts`
- **Why it matters:** These are deterministic core learning rules with edge cases around mastery bounds and irregular/regular verbs.
- **Suggested implementation:** Test correct/incorrect transitions, maximum level, review intervals, normalization, endings, and irregular exclusions.
- **Acceptance criteria:** Tests cover all branches and fail on regressions to levels, dates, or generated forms.

### 6. Add API contract/integration tests
- **File/directory:** `app/api/**`
- **Why it matters:** Save, review, reset, stats, lessons, and AI parsing form the application’s data contract but have no visible automated coverage.
- **Suggested implementation:** Use the repository’s eventual test runner and mocked Gemini/PostgreSQL boundaries to cover success, validation, authorization, and failure paths.
- **Acceptance criteria:** Each route has tests for valid requests, malformed input, dependency failure, and ownership isolation.

### 7. Add component/e2e tests for main learning flows
- **File/directory:** `app/page.tsx`; `app/review/page.tsx`; `app/review/forms/page.tsx`; `app/stories/page.tsx`
- **Why it matters:** Client state, localStorage, speech controls, language switching, and delayed review advancement can regress without detection.
- **Suggested implementation:** Test parse-curate-save, word review, forms review, empty states, language selection, and error rendering with browser APIs mocked.
- **Acceptance criteria:** The primary flows are executable in CI and verify visible outcomes, not only internal calls.

## Small improvements

### 8. Validate supported language codes consistently
- **File/directory:** `app/page.tsx`; all language-dependent API routes; shared library location
- **Why it matters:** The UI offers a fixed language set, but APIs accept arbitrary strings and can create inconsistent data.
- **Suggested implementation:** Define one shared supported-language map and reject unsupported or equal source/target combinations server-side.
- **Acceptance criteria:** UI and APIs use the same list; invalid language requests return 400.

### 9. Persist and expose generated lesson content consistently
- **File/directory:** `app/page.tsx`; `app/api/parse-notes/route.ts`; `app/api/words/save/route.ts`
- **Why it matters:** The model generates a story and quizzes, but the save request sends an empty story and discards quizzes.
- **Suggested implementation:** Preserve the generated story during curation and either store/display quizzes or stop requesting them until supported.
- **Acceptance criteria:** Saved stories contain the generated story, and quiz behavior is either fully available or no longer generated.

### 9.1. Replace heuristic regular-verb splitting
- **File/directory:** `app/review/page.tsx`; `app/api/parse-notes/route.ts`; `lib/italian-conjugation.ts`
- **Why it matters:** Splitting the displayed word by guessed suffixes is language-specific and can highlight incorrect stems/endings.
- **Suggested implementation:** Use structured parser metadata where available, or isolate language-specific morphology behind a typed helper and provide a safe unsplit fallback.
- **Acceptance criteria:** Italian displays correct splits for supported forms; unsupported languages do not use Italian heuristics; malformed words remain readable.

### 10. Improve client fetch error handling and loading cleanup
- **File/directory:** all client pages under `app/**/page.tsx`
- **Why it matters:** Several fetches parse JSON without checking status and some async actions can leave stale UI state after failures.
- **Suggested implementation:** Centralize a small typed fetch helper or add consistent status checks, error messages, and `finally` cleanup.
- **Acceptance criteria:** Network/API failures render actionable errors and controls return to a usable state.

## Larger features

### 11. Implement complete quiz and lesson-learning workflows
- **File/directory:** `app/page.tsx`; new quiz components/routes; `lib/schema.sql`
- **Why it matters:** Quiz generation is currently unused, leaving a major part of the lesson-retention concept incomplete.
- **Suggested implementation:** Store quiz prompts/options/answers and review state, add lesson-specific quiz UI, and connect results to progress metrics.
- **Acceptance criteria:** A saved lesson can be opened and completed as quizzes; answers are scored and progress is persisted per user.

### 12. Add multi-user profiles and language preferences
- **File/directory:** `lib/schema.sql`; `lib/db.ts`; dashboard and review pages
- **Why it matters:** The schema has profiles but no implemented profile lifecycle or user-facing preference management.
- **Suggested implementation:** Create profile provisioning, selectable native/target languages, per-user defaults, and migration-safe constraints.
- **Acceptance criteria:** Preferences persist per account, drive all pages consistently, and cannot leak across users.

## Technical debt

### 13. Establish schema migrations and relational integrity
- **File/directory:** `lib/schema.sql`; deployment configuration
- **Why it matters:** Initialization SQL mixes table creation and ad hoc ALTER statements; lessons/profiles lack foreign keys to users, and repeatable production upgrades are unclear.
- **Suggested implementation:** Adopt an existing migration approach, add explicit user/profile relationships and uniqueness constraints, and document deployment order.
- **Acceptance criteria:** Fresh and existing databases upgrade reproducibly; invalid orphaned records are prevented.

### 13.1. Make save deduplication race-safe
- **File/directory:** `lib/schema.sql`; `app/api/words/save/route.ts`
- **Why it matters:** Application-level duplicate checks can race and create duplicate words or conjugations.
- **Suggested implementation:** Audit and clean existing duplicates, add normalized unique constraints/indexes, and use conflict-safe inserts while preserving saved/skipped counts.
- **Acceptance criteria:** Concurrent saves cannot create duplicate normalized entries; existing data is preserved after cleanup; duplicate responses remain accurate.

### 14. Centralize shared types, constants, and validation
- **File/directory:** `app/page.tsx`; review pages; API routes; `lib/**`
- **Why it matters:** Language lists, response shapes, and review types are duplicated and can drift.
- **Suggested implementation:** Move shared domain types, language metadata, validation, and response helpers into `lib/`.
- **Acceptance criteria:** Each domain definition has one source of truth and all consumers compile against it.

### 15. Add observability and production safeguards
- **File/directory:** API routes; Docker/deployment configuration
- **Why it matters:** Errors are logged generically, request limits are absent, and Gemini/database health and cost behavior are not visible.
- **Suggested implementation:** Add structured request/error logging, dependency health checks, rate limiting, input size limits, and monitored metrics without logging secrets or lesson content.
- **Acceptance criteria:** Operators can identify dependency failures and abuse patterns; sensitive data is excluded from logs; limits are documented.

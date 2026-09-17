# Multilingual Data Scale Estimates

## Planning scenario

Use this scenario when evaluating schema, query, indexing, or language-support changes:

- One primary learning language: Italian.
- A large Italian vocabulary: approximately 100,000 lexemes.
- Approximately 8,000 Italian verbs.
- Translations for roughly 40–45 European source languages.
- An average of 1.5 translations per Italian lexeme per source language.
- Approximately 50 conjugation forms per verb across supported tenses and persons.

These values are planning estimates, not a fixed product limit. The actual size depends on senses, aliases, regional variants, grammatical forms, editorial versions, and review events.

## Approximate row counts

| Logical data | Calculation | Approximate rows |
|---|---:|---:|
| Italian lexemes | 100,000 Italian entries | 100,000 |
| Multilingual senses/translations | 100,000 × 45 × 1.5 | 6,750,000 |
| Shared Italian conjugations | 8,000 × 50 | 400,000 |
| Conjugations duplicated per source language | 400,000 × 45 | 18,000,000 |

The preferred design keeps Italian conjugations shared and stores source-language translations/senses separately. Duplicating every conjugation for every source language should only be considered when the linguistic content genuinely differs.

## Approximate PostgreSQL storage

Very rough planning ranges, including ordinary table indexes:

| Storage design | Planning range |
|---|---:|
| Shared conjugations and multilingual senses | 3–8 GB |
| Conjugations duplicated per source language | 15–40+ GB |
| With extensive indexes, audit/version data, and growth | 30–80+ GB |

Actual storage depends on text lengths, UUID and index overhead, JSON fields, PostgreSQL fill factors, dead tuples, audit history, and retained review history. Measure representative fixtures before selecting infrastructure capacity.

## User-state growth

Personalized SRS state can become larger than shared language content:

- 10,000 users learning 5,000 Italian entries each creates approximately 50 million `user_lexemes` rows.
- If each user practices 500 conjugation forms, `user_lexeme_conjugations` adds approximately 5 million rows.
- A row for every answer or review event can grow much faster than current mastery tables.

User mastery, due dates, and review history must remain separate from canonical vocabulary and conjugation content.

## Architectural implications

- Keep canonical Italian lexemes shared once.
- Keep Italian conjugations shared once where the content is independent of the learner's source language.
- Store translations/senses by source language.
- Keep mastery and scheduling in user-specific mapping tables.
- Keep review history in a separate append-oriented table if introduced.
- Avoid separate physical tables such as `italian_lexemes` and `italian_conjugations` unless measured requirements justify them.

## Partitioning guidance

PostgreSQL partitioning has no separate license fee, but it adds migration and operational complexity. Do not partition solely because these tables may eventually become large.

First:

1. Add indexes aligned with user, language, and due-date access patterns.
2. Bound and paginate review queues, lessons, forms, translations, and distractors.
3. Run `EXPLAIN (ANALYZE, BUFFERS)` on representative multi-language data.
4. Measure p95 latency, rows scanned, database size, connection pressure, vacuum behavior, and growth by language.

If canonical content becomes very large and language-filtered queries become a measured bottleneck, evaluate declarative partitioning by `language_code`. Conjugations currently inherit language through `lexeme_id`, so partitioning them by language requires a carefully validated design; do not add an inconsistent duplicate column just to partition early.

If review history is added, time-based partitioning is usually more appropriate for that append-heavy data than partitioning current mastery rows by language.

## Development rule

Every new language feature, schema change, query, import, or generated-content workflow must consider these planning volumes. Avoid unbounded queries, per-user duplication of canonical content, and designs that multiply shared conjugations by source language without a demonstrated requirement.

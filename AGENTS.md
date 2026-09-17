# Development guidance

Before changing database schema, migrations, language support, vocabulary/conjugation queries, imports, review APIs, or generated language content, read:

- `docs/DATA_SCALE_ESTIMATES.md`
- `docs/SCALABILITY.md`

These documents describe the expected multilingual data volumes and performance constraints that should guide implementation.

## Required performance considerations

- Keep canonical vocabulary and conjugation content shared; keep SRS state user-specific.
- Do not duplicate conjugation content for every source language unless the linguistic data genuinely differs.
- Avoid unbounded result sets and nested aggregations; use limits, pagination, and bounded JSON/form responses.
- Add indexes based on measured query patterns and validate important changes with `EXPLAIN (ANALYZE, BUFFERS)`.
- Do not introduce PostgreSQL partitioning or per-language physical tables without measurements showing the need and a migration/rollback plan.
- Consider multilingual row growth and user-state growth before adding fields, joins, imports, or review history.

When changing documentation, keep repository documentation under `docs/` unless the file is an agent or tool instruction file such as this one.

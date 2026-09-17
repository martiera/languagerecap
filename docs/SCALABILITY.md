# Scalability and Production Roadmap

## Current assessment

LanguageRecap uses Next.js with standalone production output, PostgreSQL, and Docker. This is a sound foundation for a small-to-medium service and can support horizontal application scaling.

The current Docker Compose deployment is a single-instance setup. It should be treated as an early production deployment, not as a high-availability architecture for a large user base.

## Current risks

- PostgreSQL runs as one local container with one persistent volume.
- Automated backups, point-in-time recovery, failover, read replicas, and restore testing are not configured.
- Database connection-pool sizing, query timeouts, and backpressure are not explicitly configured.
- Gemini parsing runs synchronously inside an HTTP request.
- AI requests have no job queue, idempotency, quota controls, or application-level rate limiting.
- Review and forms queries need query-plan checks and realistic-volume load testing.
- There is no centralized metrics, tracing, alerting, or structured operational logging.
- Deployment recreates one app container and has no load balancer, rolling deployment, or automated rollback.

## Target baseline

The intended future baseline is managed production with automated backups and basic failover. The final active-user target is not decided yet.

## Recommended architecture

1. Run stateless Next.js containers behind a reverse proxy or load balancer.
2. Use managed PostgreSQL with automated backups, point-in-time recovery, high availability, and tested restores.
3. Use PgBouncer or an equivalent connection-pooling layer, with explicit application pool limits and database statement timeouts.
4. Move Gemini parsing, lesson generation, and other slow operations to background jobs with persisted status, retries, and idempotency keys.
5. Add centralized logs, metrics, traces, health/readiness checks, and alerts.
6. Use Redis or an equivalent shared service only for measured cache, rate-limit, and job-coordination needs.
7. Use versioned, backward-compatible migrations with an expand/contract rollout and rollback plan.

## Staged implementation

### Stage 1: Harden one instance

- Implement authentication and server-side user isolation.
- Validate request bodies, language codes, identifiers, and model output.
- Add database pool limits, timeouts, indexes, and pagination.
- Add rate limits and input-size limits for AI endpoints.
- Treat lesson notes and generated model output as untrusted data: isolate them from trusted instructions, verify generated lessons before persistence, and bound both request frequency and model output size.
- Configure backups and verify restoration.
- Add structured errors, logs, health checks, and basic metrics.
- Load-test the main review, save, statistics, and parsing paths.

## Gemini trust boundary

Lesson notes are untrusted user content and may contain prompt-injection attempts. The parser rejects strong model-directed instructions before calling Gemini, passes notes only as delimited data, uses trusted system instructions, disables unnecessary model capabilities, and verifies the proposed lesson with a separate constrained model pass before returning it. Structural validation alone is not sufficient.

AI parsing also uses authenticated per-user and IP quotas, short request deadlines, bounded retries, and maximum output tokens. Verification adds latency and cost, so production monitoring should track rejection rate, verifier failures, model latency, token usage, and quota exhaustion. The verifier is defense in depth, not a proof of semantic safety; generated text must remain inert display data and must never be executed or interpolated into SQL.

### Stage 2: Separate slow work

- Add a durable job table or queue for Gemini parsing and lesson generation.
- Return a job ID for long-running work.
- Add retry limits, idempotency, cancellation, and visible job status.
- Keep interactive review endpoints fast and independent from AI processing.

### Stage 3: Scale application instances

- Run multiple stateless app replicas behind a load balancer.
- Add readiness and liveness checks.
- Use rolling deployments and automated rollback.
- Verify that correctness-critical state is not stored only in process memory.

### Stage 4: Optimize measured bottlenecks

- Add read replicas only when query load requires them.
- Add caching for measured hot paths with explicit invalidation rules.
- Archive or partition data if review history becomes large.
- Consider regional deployment only after latency and availability requirements justify it.

## Data and query requirements

- Keep mastery, due dates, review history, and personal notes user-specific.
- Preserve foreign keys and normalized uniqueness constraints.
- Review `EXPLAIN (ANALYZE, BUFFERS)` plans at realistic data volumes.
- Index actual access patterns, especially user/language/due-review queries.
- Bound response sizes and paginate lessons, words, and review queues.
- Define retention and archival policies for review history and generated content.

## Decision rule

Do not introduce distributed infrastructure only because it is available. First measure database saturation, request latency, Gemini throughput, queue time, and error rates. Add replicas, caching, workers, or regional infrastructure in response to observed limits and a defined availability or latency objective.

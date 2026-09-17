# Scalability and Production Roadmap

## Current assessment

LanguageRecap uses Next.js with standalone production output, PostgreSQL, and Docker. This is a sound foundation for a small-to-medium service and can support horizontal application scaling.

The current Docker Compose deployment is a single-instance setup. It should be treated as an early production deployment, not as a high-availability architecture for a large user base.

## Current risks

- PostgreSQL runs as one local container with one persistent volume.
- Automated backups, point-in-time recovery, failover, read replicas, and restore testing are not configured.
- Database connection-pool sizing, query timeouts, and backpressure are not explicitly configured.
- Authentication and real user isolation are not complete; routes still rely on the demo user.
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
7. Use a CDN/object storage layer for static assets and future media.
8. Use versioned, backward-compatible migrations with an expand/contract rollout and rollback plan.

## Staged implementation

### Stage 1: Harden one instance

- Implement authentication and server-side user isolation.
- Validate all request bodies, language codes, identifiers, and model output.
- Add database pool limits, timeouts, indexes, and pagination.
- Add rate limits and input-size limits for AI endpoints.
- Configure backups and verify restoration.
- Add structured errors, logs, health checks, and basic metrics.
- Load-test the main review, save, statistics, and parsing paths.

### Stage 2: Separate slow work

- Add a durable job table or queue for Gemini parsing and lesson generation.
- Return a job ID for long-running work.
- Add retry limits, idempotency, cancellation, and visible job status.
- Keep interactive review endpoints fast and independent from AI processing.

### Stage 3: Scale application instances

- Run multiple stateless app replicas.
- Put them behind a load balancer.
- Add readiness and liveness checks.
- Use rolling deployments and automated rollback.
- Verify that no correctness-critical state is stored only in process memory.

### Stage 4: Optimize measured bottlenecks

- Add read replicas only when query load requires them.
- Add caching for measured hot paths with explicit invalidation rules.
- Archive or partition data if review history becomes large.
- Consider regional deployment only after latency and availability requirements justify it.

## Data and query requirements

- Keep mastery, due dates, review history, and personal notes user-specific.
- Preserve foreign keys and normalized uniqueness constraints.
- Review `EXPLAIN (ANALYZE, BUFFERS)` plans at realistic data volumes.
- Index the actual access patterns, especially user/language/due-review queries.
- Bound response sizes and paginate lessons, words, and review queues.
- Define retention and archival policies for review history and generated content.

## Release checklist

- [ ] Authentication and user isolation verified.
- [ ] Database backup and restore tested.
- [ ] Schema migrations tested on a production-like copy.
- [ ] Connection limits and statement timeouts configured.
- [ ] AI rate limits, quotas, retries, and idempotency implemented.
- [ ] Health/readiness endpoints monitored.
- [ ] Centralized logs, metrics, traces, and alerts configured.
- [ ] Load tests completed for expected traffic.
- [ ] Rolling deployment and rollback tested.
- [ ] Current bottlenecks measured before adding cache, replicas, or regional infrastructure.

## Decision rule

Do not introduce distributed infrastructure only because it is available. First measure database saturation, request latency, Gemini throughput, queue time, and error rates. Add replicas, caching, workers, or regional infrastructure in response to observed limits and a defined availability or latency objective.

# Gemini Security Boundary

## Trust model

Lesson notes are untrusted user data. They may contain text that attempts to redirect the model, reveal hidden instructions, change the requested task, or generate content unrelated to the lesson. Model output is also untrusted and must be treated as inert data.

The parser therefore:

- Rejects strong model-directed prompt-injection patterns before making an AI request.
- Places trusted instructions in `systemInstruction` and wraps notes in explicit `<lesson_notes>` delimiters.
- Instructs both models never to follow commands in notes or candidate output.
- Does not enable tools, function calls, browsing, retrieval, or user-controlled generation settings.
- Enforces bounded notes, item counts, text lengths, conjugation counts, quiz structure, and model output tokens.
- Runs a separate verifier model over the notes and candidate JSON before returning the lesson.
- Fails closed when generation, parsing, structural validation, or verification fails.

## Abuse and cost controls

The parser uses a PostgreSQL-backed request ledger:

- Two accepted requests per authenticated user per minute.
- Thirty accepted requests per source IP per day.
- A 30-second deadline for each Gemini call.
- A bounded model output budget.
- At most the configured generation-model fallback sequence plus one verifier call.

The ledger migration is `migrations/002_ai_request_limits.sql`. Deployments must apply numbered migrations before enabling the updated parser.

## Residual risks

Prompt-injection detection is heuristic and cannot prove that arbitrary language is safe. The verifier is defense in depth, not a formal semantic guarantee. Language correctness and relevance remain model-assisted checks and should be monitored in production. Generated text must never be executed, rendered as raw HTML, interpolated into SQL, or treated as configuration.

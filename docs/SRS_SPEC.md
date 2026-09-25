# Vocabulary Spaced-Repetition Specification

This document records the current vocabulary SRS contract and decisions. It
applies to regular vocabulary cards only; conjugation/Form review remains a
separate feature.

## Card state and algorithms

Each user's vocabulary card stores scheduling state independently from shared
lexeme content: difficulty, stability, an unfuzzed base interval, state, due
time, last review time, review count, lapse count, leech flag, learning step,
and card type. Review events are append-only and record the before/after
state.

The configured algorithm is `ladder` by default, with `fsrs` available behind
the same scheduling interface. The ladder's base interval is persisted
separately from the applied, fuzzed interval. Fuzz changes only the applied
interval and due time; the next ladder rung is selected from the base interval.
After the final configured rung, the base interval doubles and is capped at
`maxIntervalDays` (currently 365 days). FSRS uses its native scheduling and
does not apply ladder fuzz or the ladder lapse ratio.

## Learning steps

New cards use the configured learning steps, currently 0 minutes, 10 minutes,
and 180 minutes. A successful review advances one step; a failure returns the
card to step 1. Completing the final step graduates the card to review.

Relearning is configured separately and defaults to one 10-minute step. A
ladder lapse uses only the relearning steps before returning to review with its
reduced base interval. FSRS receives the same setting as its
`relearning_steps`.

## Long-term ladder

The default base ladder is:

`1, 3, 7, 16, 35, 75, 150` days.

`Good` advances one rung, `Easy` advances two rungs, and `Hard` applies its
configured reduction without moving backward. Applied ladder intervals receive
approximately +/-5% fuzz, bounded by the configured fuzz ratio. A card is
considered learned when it is in review state and its stability is at least
21 days; learned cards continue to be scheduled indefinitely.

## Lapses and leeches

For the ladder, `Again` increments lapses, returns a review card to
relearning, and reduces its persisted base interval to 40% of the previous
base interval, bounded to 30%-50% by configuration and never below one day.
The reduced base interval is retained when the card graduates from relearning.
FSRS uses native lapse behavior; the ladder lapse ratio does not apply.

Eight or more lapses flag a card as a leech. Leech status is a prompt to
change the encoding (for example, a new example sentence, mnemonic, or note),
not merely to repeat the same card.

## Daily limits and queue behavior

The default limits are 15 new cards per local day and 150 reviews per local
day. Configured limits are bounded by the shared SRS limits. New words from a
large lesson are spread across days rather than bypassing the new-card cap.
Reviews are ordered by overdue time and then difficulty. Skipped days do not
create a backlog wall; the queue remains capped.

When no card is currently due, learning and relearning cards due within the
20-minute learn-ahead window may be shown. The window is configurable from
0-60 minutes; zero disables learn-ahead. Review-state cards are never shown
early. A review submitted within the window is timestamped at the actual
submission time and scheduled from that time.

Day boundaries use the user's validated IANA time zone. Timestamps are stored
in UTC. Daily cap checks, dashboard calculations, and session accounting use
the user's local day.

## Card types

Base-word recap alternates between two presentation levels: Level 0 is
multiple-choice recognition and Level 1 is typed production. A recognition
review moves the next presentation to production; the following production
attempt, whether correct or incorrect, returns the next presentation to Level
0 recognition. This presentation cycle is separate from SRS reps, intervals,
and review-state scheduling.

The database retains card-type and unlock columns for compatibility with
existing data, but the base-word review path does not permanently promote a
card to cloze. Conjugation/Form review has its own separate progression and
level rules.

## Completion rules

A daily session is complete when the due queue is empty and every card that
failed during that session has subsequently been answered correctly once.

A lesson recap is complete when every vocabulary word selected for that lesson
has graduated from the learning/relearning phase into review state. The
21-day learned threshold is not required for lesson recap completion.

## Answering, grading, and integrity

Typed answers are checked using the user's diacritics, typo-tolerance, and
article/gender settings. Grades are Again, Hard, Good, or Easy. A manually
submitted grade requires an explicit override and is logged as an override.
Review-log insertion and card-state updates occur in one database transaction.
Reviews submitted before a card is due are rejected, subject to any explicitly
configured learn-ahead behavior.

## Decisions taken so far

- Vocabulary SRS is separate from Forms/conjugation scheduling.
- Canonical lexemes and senses remain shared; scheduling state is per user.
- PostgreSQL is the source of truth for card state and append-only review logs.
- The scheduler is pure and has no database, framework, or UI dependencies.
- The production review path selects ladder or FSRS from shared configuration.
- Persisted base intervals make ladder progression reproducible despite fuzz.
- Lesson membership reuses the existing `lesson_lexemes` relation.
- Invalid saved time zones are rejected rather than silently converted to UTC.
- Dashboard retention is measured from review logs, not estimated learning speed.
- The study API reports the earliest remaining due time and the study UI
  refetches automatically when that time arrives, displaying it in the user's
  time zone when the queue is empty.
- `lib/schema.sql` is a complete PostgreSQL snapshot, including objects from
  migrations 002, 005, and 006; migration files remain the upgrade path.

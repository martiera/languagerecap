import assert from 'node:assert/strict';
import test from 'node:test';
import { hasFullLocalCalendarDayPassed } from './mode-tier';

test('day gate rejects timestamps on the same local calendar day', () => {
  assert.equal(
    hasFullLocalCalendarDayPassed(
      new Date('2026-09-25T05:00:00Z'),
      new Date('2026-09-25T20:00:00Z'),
      'Europe/Riga',
    ),
    false,
  );
});

test('day gate accepts one minute after local midnight on the next day', () => {
  assert.equal(
    hasFullLocalCalendarDayPassed(
      new Date('2026-09-25T20:59:00Z'),
      new Date('2026-09-26T21:01:00Z'),
      'Europe/Riga',
    ),
    true,
  );
});

test('day gate accepts a Europe/Riga DST transition', () => {
  assert.equal(
    hasFullLocalCalendarDayPassed(
      new Date('2026-10-24T21:30:00Z'),
      new Date('2026-10-25T22:01:00Z'),
      'Europe/Riga',
    ),
    true,
  );
});

test('day gate rejects a null introduced timestamp', () => {
  assert.equal(
    hasFullLocalCalendarDayPassed(null, new Date('2026-09-26T00:01:00Z'), 'Europe/Riga'),
    false,
  );
});

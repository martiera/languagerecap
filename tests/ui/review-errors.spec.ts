import { expect, test } from '@playwright/test';

const reviewCard = {
  id: 'ui-test-card',
  targetText: 'andare',
  translation: 'to go',
  type: 'verb',
  masteryLevel: 0,
  modeTier: 0,
  reps: 0,
  cardType: 'recognition',
  itemKind: 'word',
  options: ['to go', 'to be', 'to speak', 'to write'],
  helperForms: [],
  isIrregular: false,
};

const reviewQueue = {
  words: [reviewCard],
  sourceLanguage: 'en',
  targetLanguage: 'it',
  timezone: 'UTC',
  nextDueAt: null,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      user: {
        activeSourceLanguage: 'en',
        activeTargetLanguage: 'it',
        timezone: 'UTC',
      },
    }),
  }));
  await page.route('**/api/profile', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ timezone: 'UTC' }),
  }));
  await page.route('**/api/stats', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      pairs: [{
        sourceLanguage: 'en',
        targetLanguage: 'it',
        lessons: 1,
        words: 1,
        mastered: 0,
        due: 1,
        newAvailable: 1,
        retentionCorrect: 0,
        retentionTotal: 0,
        timeSpentMs: 0,
      }],
    }),
  }));
});

test('a review queue 500 shows a retryable error, not the empty state', async ({ page }) => {
  let retry = false;
  await page.route('**/api/words/review?*', route => retry
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(reviewQueue) })
    : route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Could not load reviews.' }),
    }));

  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Reviews unavailable.' })).toBeVisible();
  await expect(page.locator('section[role="alert"]')).toContainText(
    'Something went wrong loading your reviews - try again',
  );
  await expect(page.getByRole('heading', { name: 'Keep going.' })).toHaveCount(0);
  await expect(page.getByText("You're all caught up.")).toHaveCount(0);

  retry = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: /A to go/ })).toBeVisible();
});

test('a stale review is acknowledged before the queue is refetched', async ({ page }) => {
  let queueReads = 0;
  let submissions = 0;
  await page.route('**/api/words/review?*', route => {
    queueReads += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(reviewQueue),
    });
  });
  await page.route('**/api/words/review', route => {
    submissions += 1;
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'This review is stale. Refresh the review queue.',
        code: 'STALE_REVIEW',
        refresh: true,
      }),
    });
  });

  await page.goto('/review');
  await page.getByRole('button', { name: /A to go/ }).click();
  await expect(page.getByRole('status')).toHaveText(
    "That answer didn't go through - refreshing your cards",
  );
  const secondOption = page.getByRole('button', { name: /B to be/ });
  await expect(secondOption).toBeDisabled();
  await secondOption.click({ force: true });
  await page.waitForTimeout(100);
  expect(submissions).toBe(1);
  const readsAfterConflict = queueReads;
  await page.waitForTimeout(200);
  expect(queueReads).toBe(readsAfterConflict);
  await expect.poll(() => queueReads).toBeGreaterThan(readsAfterConflict);
});

test('a review queue 401 redirects to login', async ({ page }) => {
  await page.route('**/api/words/review?*', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Unauthorized.' }),
  }));

  await page.goto('/review');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('a review submission 401 redirects to login instead of showing wrong-answer feedback', async ({ page }) => {
  await page.route('**/api/words/review?*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(reviewQueue),
  }));
  await page.route('**/api/words/review', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Unauthorized.' }),
  }));

  await page.goto('/review');
  await page.getByRole('button', { name: /A to go/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Wrong')).toHaveCount(0);
});

test('a tapped answer is highlighted immediately and stays marked when correct feedback arrives', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/words/review?*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(reviewQueue),
  }));

  let releaseSubmission: () => void = () => {};
  const submissionDelay = new Promise<void>(resolve => {
    releaseSubmission = resolve;
  });
  await page.route('**/api/words/review', async route => {
    await submissionDelay;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ isCorrect: true }),
    });
  });

  await page.goto('/review');
  const selectedOption = page.getByRole('button', { name: /A to go/ });
  await selectedOption.click();
  await expect(selectedOption).toContainText('Checking...');
  await expect(selectedOption).toHaveClass(/border-accent/);

  releaseSubmission();
  await expect(selectedOption).toContainText('Your answer: Correct');
  await expect(selectedOption).toHaveClass(/border-positive/);
});

test('wrong feedback shows the correct answer beside the selected choice on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/words/review?*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(reviewQueue),
  }));
  await page.route('**/api/words/review', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ isCorrect: false }),
  }));

  await page.goto('/review');
  const wrongOption = page.getByRole('button', { name: /B to be/ });
  const correctOption = page.getByRole('button', { name: /A to go/ });
  await wrongOption.click();
  await expect(wrongOption).toContainText('Wrong · Correct answer: to go');
  await expect(wrongOption).toHaveClass(/border-accent/);
  await expect(correctOption).toContainText('Correct answer');
  await expect(correctOption).toHaveClass(/border-positive/);
  await expect(page.getByText('Translation: to go')).toHaveCount(0);
  const inlineCorrection = page.getByText('Wrong · Correct answer: to go');
  await expect(inlineCorrection).toBeVisible();
  const correctionBounds = await inlineCorrection.boundingBox();
  expect(correctionBounds).not.toBeNull();
  expect(correctionBounds!.y + correctionBounds!.height).toBeLessThan(812);

  await expect(inlineCorrection).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByRole('heading', { name: 'Keep going.' })).toBeVisible();
  await expect(wrongOption).toHaveClass(/bg-paper/);
  await expect(wrongOption).not.toHaveClass(/border-accent|border-positive/);
});

test('typed-answer feedback keeps the expected translation panel', async ({ page }) => {
  await page.route('**/api/words/review?*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ...reviewQueue,
      words: [{ ...reviewCard, cardType: 'production' }],
    }),
  }));
  await page.route('**/api/words/review', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ isCorrect: false }),
  }));

  await page.goto('/review');
  await page.getByPlaceholder('Type the English translation...').fill('to be');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Translation: to go')).toBeVisible();
});

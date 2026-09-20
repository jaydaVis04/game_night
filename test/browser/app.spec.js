import { randomUUID } from 'node:crypto';
import { test, expect, request, setupHost, addPlayers, waveFixture } from './fixtures.js';

test('first host can build a roster, pick a game, celebrate, undo, and see a truthful podium', async ({
  page,
  club,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(club.url);
  await expect(page.getByRole('heading', { name: 'Make a night of it.' })).toBeVisible();
  await expect(page.locator('.counter-count')).toHaveText('Players: 0');
  await page.getByRole('button', { name: 'Set up club', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('game-host');
  await page.getByLabel('Password', { exact: true }).fill('a-new-game-night-password');
  await page.getByLabel('Setup code', { exact: true }).fill('browser-test-setup');
  await page.getByRole('button', { name: 'Create host account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Host settings', exact: true })).toBeVisible();
  for (const name of ['Alice', 'Bob', 'Charlie']) {
    await page.getByRole('button', { name: 'Add player', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Player name').fill(name);
    await dialog.getByRole('button', { name: 'Add player', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.locator('.counter-count')).toHaveText('Players: 3');
  await expect(page.getByRole('button', { name: 'Log win for Alice' })).toBeDisabled();
  await page.getByRole('button', { name: 'Pick a game', exact: true }).click();
  await expect(page.locator('.game-option')).toHaveCount(7);
  await page.getByRole('button', { name: /^Poker/ }).click();
  await expect(page.locator('.app')).toHaveClass(/theme-poker/);
  await expect(page.locator('.player-counter')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Log win for Alice' }).click();
  await expect(page.getByRole('dialog', { name: 'Winner celebration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alice takes the win!' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo this win' }).click();
  await expect(page.getByRole('dialog', { name: 'Winner celebration' })).toBeHidden();
  const aliceCard = page
    .locator('.player-card')
    .filter({ has: page.locator('.player-name', { hasText: 'Alice' }) });
  await expect(aliceCard.locator('.player-wins strong')).toHaveText('0');
  await page.getByRole('button', { name: 'Log win for Alice' }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('button', { name: 'Log win for Bob' }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.locator('.podium')).toBeVisible();
  await expect(page.locator('.podium-place').filter({ hasText: 'Alice' })).toContainText('Tied');
  await expect(page.locator('.ranking-row .rank-number')).toHaveText(['1', '1', '3']);
  await page.reload();
  await expect(page.locator('.ranking-row')).toHaveCount(3);
  await expect(page.getByRole('dialog', { name: 'Winner celebration' })).toBeHidden();
  expect(errors).toEqual([]);
});

test('phone joins live, host explicitly matches a name, and a fresh night expires old QR links', async ({
  page,
  browser,
  club,
}) => {
  await setupHost(page, club);
  await addPlayers(page, club, ['Alice']);
  await page.goto(club.url);
  const state = await (await page.request.get(`${club.url}/api/state`)).json();
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  try {
    await phone.goto(`${club.url}/join/${state.night.code}`);
    await expect(phone.getByRole('heading', { name: 'Pull up a chair.' })).toBeVisible();
    await expect(phone.locator('form input')).toHaveCount(1);
    await phone.getByLabel('Your name', { exact: true }).fill('Alicé');
    await phone.getByRole('button', { name: 'Join tonight' }).click();
    await expect(phone.getByText('Waiting for your host', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /friend is waiting to join/ }).click();
    await expect(page.getByRole('button', { name: 'Approve player' })).toBeDisabled();
    await page.getByRole('radio', { name: /Alice/ }).check();
    await page.getByRole('button', { name: 'Approve player' }).click();
    await expect(phone.getByRole('heading', { name: 'You’re in, Alicé.' })).toBeVisible();
    await expect(page.locator('.counter-count')).toHaveText('Players: 1');
    await phone.reload();
    await expect(phone.getByRole('heading', { name: 'You’re in, Alicé.' })).toBeVisible();
    expect(
      await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await request(page, club, '/night/new', {});
    await phone.reload();
    await expect(phone.getByRole('heading', { name: 'This night has wrapped up.' })).toBeVisible();
    const guestMutation = await phone.request.post(`${club.url}/api/players`, {
      data: { name: 'Unapproved' },
      headers: { 'X-Victory-Request': '1' },
    });
    expect(guestMutation.status()).toBe(401);
  } finally {
    await phoneContext.close();
  }
});

test('host settings support one-tap leader, persistent audio trims, extra hosts and game themes', async ({
  page,
  club,
}) => {
  await setupHost(page, club);
  await addPlayers(page, club, ['Morgan']);
  await request(page, club, '/night/game', { gameId: 'coup' });
  await page.goto(`${club.url}/#host`);
  const leading = page.getByRole('switch', { name: 'Show who’s currently winning' });
  await expect(leading).toHaveAttribute('aria-checked', 'false');
  await leading.click();
  await expect(leading).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'The table', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as currently winning: Morgan' }).click();
  await expect(page.getByText('Currently leading', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Host settings', exact: true }).click();
  await page
    .getByLabel('Upload win sound')
    .setInputFiles({ name: 'victory-loop.wav', mimeType: 'audio/wav', buffer: waveFixture() });
  await expect(page.getByRole('slider', { name: 'Clip start' })).toBeVisible();
  await page.getByRole('slider', { name: 'Clip start' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', { name: 'Clip start' })).toHaveAttribute(
    'aria-valuenow',
    '0.1',
  );
  await page.getByLabel('Start (seconds)').fill('2');
  await page.getByLabel('End (seconds)').fill('9');
  await page.getByLabel('Clip name', { exact: true }).fill('The winning moment');
  await page.getByRole('button', { name: 'Preview slice' }).click();
  await expect(page.locator('.sound-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save clip' }).click();
  const clip = page.locator('.sound-item').filter({ hasText: 'The winning moment' });
  await expect(clip).toContainText('7.0s');
  await clip.getByRole('button', { name: 'Use sound' }).click();
  await expect(clip.getByRole('button', { name: 'Selected' })).toBeVisible();
  await page.reload();
  await expect(clip.getByRole('button', { name: 'Selected' })).toBeVisible();
  await page.getByRole('tab', { name: 'Host accounts' }).click();
  await page.getByLabel('Username', { exact: true }).fill('co-host');
  await page.getByLabel('Password', { exact: true }).fill('another-strong-password');
  await page.getByRole('button', { name: 'Create host account' }).click();
  await expect(page.getByText('co-host can now host a game night.')).toBeVisible();
  await page.getByRole('tab', { name: 'Games & themes' }).click();
  await page.getByRole('button', { name: 'Add game', exact: true }).click();
  await page.getByLabel('Game name', { exact: true }).fill('Family Favorites');
  await page.getByLabel('A short description').fill('A new game joins the club.');
  await page.getByRole('dialog').getByRole('button', { name: 'Add game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Family Favorites', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Morgan', exact: true }).click();
  await page.getByLabel('Player name').fill('Morgan & friends');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Morgan & friends', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page
    .getByLabel('Upload win sound')
    .setInputFiles({ name: 'tiny.wav', mimeType: 'audio/wav', buffer: waveFixture(1.23625) });
  await expect(page.getByRole('slider', { name: 'Clip end' })).toBeVisible();
  expect(await page.locator('.sound-editor').evaluate((form) => form.checkValidity())).toBeTruthy();
  await page.getByRole('button', { name: 'Save clip' }).click();
  await expect(page.locator('.sound-item').filter({ hasText: 'tiny' })).toContainText('1.2s');
});

test('a shared guest display updates live and dismisses celebrations after ten seconds', async ({
  page,
  browser,
  club,
}) => {
  await setupHost(page, club);
  await addPlayers(page, club, ['The champion']);
  await request(page, club, '/night/game', { gameId: 'challengers' });
  await page.goto(club.url);
  await page.getByRole('button', { name: 'Enable victory sounds' }).click();
  await expect(page.getByRole('button', { name: 'Mute victory sounds' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const display = await browser.newContext();
  const screen = await display.newPage();
  try {
    await screen.goto(club.url);
    await expect(screen.getByRole('button', { name: 'Host sign in', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Log win for The champion' }).click();
    const celebration = screen.getByRole('dialog', { name: 'Winner celebration' });
    await expect(celebration).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Undo this win' })).toHaveCount(0);
    await request(page, club, '/settings', { currentlyWinning: true }, 'PATCH');
    await expect(celebration).toBeHidden({ timeout: 12500 });
    await expect(screen.locator('.player-wins strong')).toHaveText('1');
    await screen.reload();
    await expect(screen.locator('.player-wins strong')).toHaveText('1');
    await expect(celebration).toBeHidden();
  } finally {
    await display.close();
  }
});

test('all seven themes work offline with reduced motion and fit phone and shared displays', async ({
  page,
  club,
}, testInfo) => {
  await setupHost(page, club);
  const players = await addPlayers(page, club, ['Jay', 'Amara', 'Theo', 'June', 'Sam', 'Charlie']);
  const remoteRequests = [];
  page.on('request', (incoming) => {
    if (!incoming.url().startsWith(club.url) && !incoming.url().startsWith('data:'))
      remoteRequests.push(incoming.url());
  });
  await page.route('**/*', (route) =>
    route.request().url().startsWith(club.url) ? route.continue() : route.abort(),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(club.url);
  await expect(page.locator('.player-card')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('table-desktop.png'), fullPage: true });
  const state = await (await page.request.get(`${club.url}/api/state`)).json();
  for (const game of state.games) {
    await request(page, club, '/night/game', { gameId: game.id });
    await expect(page.locator('.app')).toHaveClass(new RegExp(`theme-${game.themeKey}`));
    await expect(page.locator('.player-counter')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    const animated = await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length,
    );
    expect(animated).toBe(0);
  }
  await request(page, club, '/wins', {
    playerId: players[0].id,
    gameId: 'clue',
    requestId: randomUUID(),
  });
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('leaderboard-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'The table', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('table-mobile.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  expect(remoteRequests).toEqual([]);
});

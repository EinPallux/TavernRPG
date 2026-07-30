import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 10 acceptance: the Guild Hall, from the player's side.
 *
 * The engine tests prove the buffs, the applicant rate, the bounty band and the chat audit. These
 * prove the parts only a browser can, and there are two of them because guilds have **two faces**:
 * the player who *joins* one of the sixty, and the player who *founds* the sixty-first. Both paths
 * lead to the same room and the same rules, and the whole design falls apart if only one of them
 * was ever walked — so both are walked here.
 *
 * As everywhere else in this suite, anything that mutates then navigates flushes first: the
 * store's autosave is asynchronous and a reload without a flush is racing its own write.
 */

const SETUP_TIMEOUT = 20_000;

interface StoreHandle {
  getState: () => { save: Save | null; flush: () => Promise<void> };
  setState: (partial: { save: Save }) => void;
}
interface Save {
  hero: { level: number; gold: number; dice: number; honor: number; name: string } | null;
  world: {
    seed: number;
    lastSimAt: number;
    guilds: { id: number; memberIds: number[]; treasury: number }[];
  } | null;
  guild: {
    guildId: number | null;
    joinedAt: number | null;
    application: { guildId: number; decidesAt: number } | null;
    roster: number[];
    treasuryStep: number;
    treasuryPool: number;
    contributions: Record<string, number>;
    chat: unknown[];
    bounty: { bountyId: string; target: number; botUnits: number; playerUnits: number } | null;
  };
}

const store = (page: Page) =>
  page.evaluate(() => {
    const handle = (window as unknown as { __tavernStore?: StoreHandle }).__tavernStore!;
    const { save } = handle.getState();
    return {
      guildId: save?.guild.guildId ?? null,
      applied: save?.guild.application?.guildId ?? null,
      roster: save?.guild.roster.length ?? 0,
      gold: save?.hero?.gold ?? 0,
      dice: save?.hero?.dice ?? 0,
      pool: save?.guild.treasuryPool ?? 0,
      step: save?.guild.treasuryStep ?? 0,
      contributed: save?.guild.contributions['player'] ?? 0,
      chat: save?.guild.chat.length ?? 0,
      bounty: save?.guild.bounty?.bountyId ?? null,
      botUnits: save?.guild.bounty?.botUnits ?? 0,
    };
  });

const flush = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as { __tavernStore: StoreHandle }).__tavernStore.getState().flush();
  });

/**
 * A hero past the level-10 gate, rich enough to found a hall and decorated enough to join one.
 *
 * Waits for creation-or-paperdoll rather than paperdoll alone, for the reason `arena.spec.ts`
 * spells out: `/character` renders the class picker when there is no hero, so a slow load lands
 * on the picker and a bare paperdoll wait spends its whole timeout looking at the wrong screen.
 */
async function readyHero(page: Page) {
  await page.goto('/character');

  const creation = page.getByTestId('hero-creation');
  const paperdoll = page.getByTestId('paperdoll');
  await expect(creation.or(paperdoll).first()).toBeVisible({ timeout: SETUP_TIMEOUT });
  if (await creation.isVisible()) {
    await page.getByTestId('class-warrior').click();
    await page.getByTestId('hero-name').fill('Kargath');
    await expect(page.getByTestId('confirm-hero')).toBeEnabled({ timeout: SETUP_TIMEOUT });
    await page.getByTestId('confirm-hero').click();
  }
  await expect(paperdoll).toBeVisible({ timeout: SETUP_TIMEOUT });

  await page.getByTestId('dev-drawer-toggle').click();
  await page.getByTestId('dev-level-10').click();
  await expect(page.getByTestId('hud-level')).toHaveText('10', { timeout: SETUP_TIMEOUT });

  await page.evaluate(async () => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save?.hero) throw new Error('no hero');
    handle.setState({
      save: { ...save, hero: { ...save.hero, level: 30, gold: 120_000, dice: 6, honor: 4_000 } },
    });
    await handle.getState().flush();
  });
}

/** Walk in already a member of one of the sixty, with a couple of days owed to the simulation. */
async function seatInAHall(page: Page) {
  const info = await page.evaluate(async () => {
    const handle = (window as unknown as { __tavernStore: StoreHandle }).__tavernStore;
    const { save } = handle.getState();
    if (!save?.world || !save.hero) throw new Error('no world');

    // A hall with a roster worth reading, and the best-funded of those so the buffs are visible.
    const hall = save.world.guilds
      .filter((guild) => guild.memberIds.length >= 12 && guild.memberIds.length < 25)
      .sort((a, b) => b.treasury - a.treasury)[0]!;

    handle.setState({
      save: {
        ...save,
        world: { ...save.world, lastSimAt: Date.now() - 2 * 86_400_000 },
        guild: { ...save.guild, guildId: hall.id, joinedAt: Date.now() - 3 * 86_400_000 },
      },
    });
    await handle.getState().flush();
    return { id: hall.id, members: hall.memberIds.length };
  });

  await page.goto('/guild');
  await expect(page.getByTestId('place-guild')).toBeVisible({ timeout: SETUP_TIMEOUT });
  await expect(page.getByTestId('guild-chat')).toBeVisible({ timeout: SETUP_TIMEOUT });
  return info;
}

test.describe('sixty halls to choose between', () => {
  test('the browse list is a decision, not a menu', async ({ page }) => {
    await readyHero(page);
    await page.goto('/guild');
    await expect(page.getByTestId('guild-browser')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const cards = page.locator('[data-testid^="hall-card-"]');
    await expect(cards.first()).toBeVisible({ timeout: SETUP_TIMEOUT });
    const count = await cards.count();
    expect(count).toBeGreaterThan(20);

    // Every card carries the three things the choice actually turns on: what the hall is like,
    // what it will take, and what it pays. A list of sixty names would be a menu.
    const first = cards.first();
    await expect(first.locator('[data-testid^="vibe-"]')).toBeVisible();
    await expect(first).toContainText('/25');
    await expect(first).toContainText('% gold');

    // And they differ. The vibe derivation exists to stop sixty identical rows shipping.
    const vibes = await page.locator('[data-testid^="vibe-"]').allInnerTexts();
    expect(new Set(vibes.slice(0, 20)).size).toBeGreaterThan(2);
  });

  test('a letter goes out and the hall takes its time answering', async ({ page }) => {
    await readyHero(page);
    await page.goto('/guild');
    await expect(page.getByTestId('guild-browser')).toBeVisible({ timeout: SETUP_TIMEOUT });

    /*
     * The first hall the player can actually *get into*, not simply the first hall.
     *
     * Whether card one is full, or wants more honour than a level-30 hero has, is a property of
     * the world seed — which is rolled per save. Reaching for `.first()` passed on most seeds and
     * spent thirty seconds clicking a greyed-out button on the rest. A browse list where a
     * decorated hero qualifies for nothing at all would be its own bug, so this still fails
     * loudly if there is no such hall.
     */
    const open = page.locator('[data-testid^="apply-"]:not([disabled])');
    await expect(open.first()).toBeVisible({ timeout: SETUP_TIMEOUT });
    await open.first().click();
    await expect(page.getByTestId('pending-application')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const applied = await store(page);
    expect(applied.applied).not.toBeNull();
    expect(applied.guildId).toBeNull();

    // Nobody answers instantly — the wait is five to ninety minutes and that is the point of it.
    await expect(page.getByTestId('guild-decision')).toHaveCount(0);

    // And it survives the player walking away, because it is in the save and not in a timer.
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('pending-application')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect((await store(page)).applied).toBe(applied.applied);
  });
});

test.describe('founding the sixty-first', () => {
  test('names it, dresses it, pays for it, and walks in', async ({ page }) => {
    await readyHero(page);
    await page.goto('/guild');
    await expect(page.getByTestId('guild-browser')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const before = await store(page);
    await page.getByTestId('toggle-founding').click();
    await expect(page.getByTestId('founding-flow')).toBeVisible({ timeout: SETUP_TIMEOUT });

    // The name is checked as it is typed, not after the gold has gone.
    await page.getByTestId('guild-name').fill('x');
    await expect(page.getByTestId('name-problem')).toBeVisible();
    await expect(page.getByTestId('confirm-founding')).toBeDisabled();

    await page.getByTestId('guild-name').fill('The Quiet Kettle');
    await page.getByTestId('guild-motto').fill('We put it on at six.');
    await page.getByTestId('field-arcane').click();
    await page.getByTestId('charge-amber').click();
    await page.getByTestId('sigil-anvil').click();
    await expect(page.getByTestId('name-problem')).toHaveCount(0);

    await page.getByTestId('confirm-founding').click();
    await expect(page.getByTestId('hall-banner')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('hall-banner')).toContainText('The Quiet Kettle');
    await expect(page.getByTestId('hall-banner')).toContainText('you are Guildmaster');

    const after = await store(page);
    expect(after.guildId).not.toBeNull();
    expect(after.gold).toBeLessThan(before.gold);
    // A hall of one still gets a bounty, scaled down to a hall of one.
    expect(after.bounty).not.toBeNull();

    // The Guildmaster's own tools, which a member of one of the sixty never sees.
    await expect(page.getByTestId('edit-motto')).toBeVisible();
    await expect(page.getByTestId('leave-guild')).toContainText('Disband');

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('hall-banner')).toContainText('The Quiet Kettle', {
      timeout: SETUP_TIMEOUT,
    });
  });

  test('the pot takes gold and Golden Dice, and both move the same bar', async ({ page }) => {
    await readyHero(page);
    await page.goto('/guild');
    await expect(page.getByTestId('guild-browser')).toBeVisible({ timeout: SETUP_TIMEOUT });

    await page.getByTestId('toggle-founding').click();
    await page.getByTestId('guild-name').fill('The Long Table');
    await page.getByTestId('confirm-founding').click();
    await expect(page.getByTestId('tracks-panel')).toBeVisible({ timeout: SETUP_TIMEOUT });

    const empty = await store(page);
    expect(empty.step).toBe(0);

    // 2,500 buys the first few steps outright and banks the change (spec §2: nothing evaporates).
    await page.getByTestId('donate-2500').click();
    const given = await store(page);
    expect(given.step).toBeGreaterThan(0);
    expect(given.gold).toBe(empty.gold - 2_500);
    expect(given.contributed).toBe(2_500);
    await expect(page.getByTestId('tracks-panel')).toContainText(`step ${given.step} of 100`);

    // A Golden Die is worth its stated gold and never the other way round (CLAUDE.md #6).
    await page.getByTestId('donate-die').click();
    const spentDie = await store(page);
    expect(spentDie.dice).toBe(given.dice - 1);
    expect(spentDie.contributed).toBeGreaterThan(given.contributed);

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('tracks-panel')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect((await store(page)).contributed).toBe(spentDie.contributed);
  });
});

test.describe('standing in a hall', () => {
  test('the buffs the room advertises are the ones the save is paying', async ({ page }) => {
    await readyHero(page);
    await seatInAHall(page);

    // A well-funded hall is worth joining, and says so in the header rather than in a tooltip.
    await expect(page.getByTestId('hall-gold-buff')).toContainText('% gold');
    await expect(page.getByTestId('hall-xp-buff')).toContainText('% xp');
    const gold = await page.getByTestId('hall-gold-buff').innerText();
    expect(Number.parseFloat(gold.replace(/[^\d.]/g, ''))).toBeGreaterThan(0);
  });

  test('the hall talked while the player was away, and answers when spoken to', async ({
    page,
  }) => {
    await readyHero(page);
    await seatInAHall(page);

    // Two days owed to the simulation is two days of chatter, generated once on the way in.
    const arrived = await store(page);
    expect(arrived.chat).toBeGreaterThan(5);

    /*
     * Say hello until somebody says it back — up to three times.
     *
     * Who answers is deliberately probabilistic: only members awake in *their* timezone can, and
     * each then answers at their own sociability. That is the feature, and it makes "exactly one
     * post always draws a reply" an assertion about the hour the suite happens to run at rather
     * than about the game. Three greetings against a roster of twelve-plus makes silence
     * vanishingly unlikely while still failing if replies are wired up wrong.
     */
    let posts = 0;
    let replies = 0;
    for (let attempt = 0; attempt < 3 && replies === 0; attempt += 1) {
      const before = await page.locator('[data-testid^="chat-"]').count();
      await page.getByTestId('chat-input').fill('hey all');
      await page.getByTestId('chat-send').click();
      posts += 1;

      await expect(page.getByTestId('guild-chat')).toContainText('hey all', {
        timeout: SETUP_TIMEOUT,
      });
      await expect
        .poll(async () => page.locator('[data-testid^="chat-"]').count(), { timeout: 4_000 })
        .toBeGreaterThan(before);

      // Everything past the player's own line is somebody answering it.
      replies = (await page.locator('[data-testid^="chat-"]').count()) - before - 1;
      // At most a couple per post — a hall where everyone answers everything is a hall of bots.
      expect(replies).toBeLessThanOrEqual(2);
    }
    expect(replies, `${posts} greetings drew no reply`).toBeGreaterThan(0);

    // And the log does not refill itself on the way back in (the day-key high-water mark).
    const said = await store(page);
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('guild-chat')).toBeVisible({ timeout: SETUP_TIMEOUT });
    expect((await store(page)).chat).toBe(said.chat);
  });

  test('the week’s bounty is posted, and the hall is already working on it', async ({ page }) => {
    await readyHero(page);
    await seatInAHall(page);

    const poster = page.getByTestId('bounty-poster');
    await expect(poster).toBeVisible();

    const state = await store(page);
    expect(state.bounty).not.toBeNull();
    // The failure this exists to catch: bot output floored to zero per member per day, so the
    // poster read 0/target forever and the co-operative goal was a solo goal nobody could reach.
    expect(state.botUnits).toBeGreaterThan(0);
    await expect(poster).toContainText(`${state.botUnits.toLocaleString()} /`);
    // Never a template with a hole in it, and never a bar without a number beside it.
    await expect(poster).not.toContainText('{target}');
    await expect(poster).toContainText('%');
  });

  test('a donation into somebody else’s pot still lands somewhere the player can see', async ({
    page,
  }) => {
    await readyHero(page);
    await seatInAHall(page);

    const before = await store(page);
    // One of the sixty has a seven-digit treasury and a six-digit next step, so without the
    // remainder on the bar the player gives ten thousand gold and nothing on screen changes.
    await expect(page.getByTestId('tracks-panel')).toContainText('toward step');

    await page.getByTestId('donate-10000').click();
    const after = await store(page);
    expect(after.gold).toBe(before.gold - 10_000);
    expect(after.contributed).toBe(10_000);

    // Named, with the rest of the week's givers — including the ones who gave nothing.
    await expect(page.getByTestId('tracks-panel')).toContainText('Kargath');
    await expect(page.getByTestId('tracks-panel')).toContainText('10,000');
  });

  test('leaving stops the buffs, and the room knows it', async ({ page }) => {
    await readyHero(page);
    await seatInAHall(page);

    await page.getByTestId('leave-guild').click();
    await expect(page.getByTestId('confirm-leave')).toBeVisible();
    await page.getByTestId('confirm-leave').click();

    // Straight back out to the browse list, with no buffs in the header.
    await expect(page.getByTestId('guild-browser')).toBeVisible({ timeout: SETUP_TIMEOUT });
    await expect(page.getByTestId('hall-gold-buff')).toHaveCount(0);
    expect((await store(page)).guildId).toBeNull();

    await flush(page);
    await page.reload();
    await expect(page.getByTestId('guild-browser')).toBeVisible({ timeout: SETUP_TIMEOUT });
  });
});

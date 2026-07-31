/**
 * Onboarding, as save-to-save transitions (tutorial spec §1, §2).
 *
 * The engine tests prove the curriculum walks forwards; these prove the four small writes and
 * the two places the tutorial reaches into the game itself — the opt-out tick at creation, and
 * the twenty-second first contract.
 *
 * The shortened contract gets the most attention because it is the one that could quietly become
 * a *discount*: the finish line moves and nothing else may, or a player would learn the loop on
 * numbers the second contract does not honour.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { createHero } from '@/engine/hero/actions';
import { createNewSave, type SaveFile } from '@/engine/save/schema';
import { drawBoard } from '@/engine/missions/board';
import { FIRST_MISSION_MS } from '@/data/tutorial';
import { tallyOf } from '@/data/progress';
import { isQuickened, shortensNextMission } from '@/engine/tutorial/firstMission';
import { activeBeat } from '@/engine/tutorial/beats';
import { accept, landMission } from './missionActions';
import {
  acknowledgeBeat,
  dismissHint,
  hasSeenExplainer,
  markExplainerSeen,
  refreshTutorialDay,
  setOptedOut,
} from './tutorialActions';

const NOW = new Date('2026-08-05T10:00:00').getTime();
const TODAY = '2026-08-05';
const SEED = 8_181;

function save(): SaveFile {
  const base = createNewSave({ slot: 1, worldSeed: SEED, now: NOW });
  const hero = createHero({
    name: 'Ysolde',
    classId: 'warrior',
    now: NOW,
    startingGold: 500,
    rng: createRng(7, 'starter'),
  });
  const board = drawBoard({ worldSeed: SEED, dayKey: TODAY, heroLevel: 1 });
  return {
    ...base,
    hero,
    activity: { ...base.activity, board: [...board], boardDay: TODAY },
  };
}

describe('the four small writes', () => {
  it('returns the same save when nothing changes', () => {
    const before = save();
    expect(setOptedOut(before, false)).toBe(before);
    expect(refreshTutorialDay(before)).toBe(before);

    const seen = markExplainerSeen(before, 'first-epic');
    expect(markExplainerSeen(seen, 'first-epic')).toBe(seen);
  });

  it('records an acknowledgement without touching anything else', () => {
    const before = save();
    const after = acknowledgeBeat(before, 'notice-board');

    expect(after.tutorial.acknowledged).toEqual(['notice-board']);
    expect(after.hero).toBe(before.hero);
    expect(after.activity).toBe(before.activity);
  });

  it('remembers an explainer has fired', () => {
    const before = save();
    expect(hasSeenExplainer(before, 'first-loss')).toBe(false);
    expect(hasSeenExplainer(markExplainerSeen(before, 'first-loss'), 'first-loss')).toBe(true);
  });

  it('clears waved-away hints at midnight, and only then', () => {
    const waved = dismissHint(save(), 'free-card');
    expect(waved.tutorial.dismissedHints).toEqual(['free-card']);
    expect(refreshTutorialDay(waved).tutorial.dismissedHints).toEqual([]);
  });

  it('stops the tour without pretending the beats happened', () => {
    const out = setOptedOut(save(), true);
    expect(activeBeat(out)).toBeNull();
    // The *facts* are untouched — turning it back on resumes at beat one, not at beat twelve.
    expect(activeBeat(setOptedOut(out, false))?.id).toBe('welcome-in');
  });
});

describe('the twenty-second first contract', () => {
  const signFirst = (file: SaveFile) => accept(file, file.activity.board[0]!.id, 10, NOW);

  it('brings the first one home in twenty seconds', () => {
    const before = save();
    expect(shortensNextMission(before)).toBe(true);

    const signed = signFirst(before);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const mission = signed.save.activity.mission!;
    expect(mission.endsAt - NOW).toBe(FIRST_MISSION_MS);
    expect(isQuickened(mission)).toBe(true);
  });

  it('moves the finish line and nothing else', () => {
    const before = save();
    const signed = signFirst(before);
    if (!signed.ok) return;

    const mission = signed.save.activity.mission!;
    // The printed length, the Vigor and the recorded spend are all the honest ten-minute ones,
    // so the payout — which `resolveMission` prices off `duration` — is unaffected.
    expect(mission.duration).toBe(10);
    expect(mission.vigorSpent).toBe(10);
    expect(signed.save.activity.vigor).toBe(before.activity.vigor - 10);
  });

  it('does it once, and never again', () => {
    const first = signFirst(save());
    if (!first.ok) return;

    const home = landMission(first.save, NOW + FIRST_MISSION_MS);
    const cleared: SaveFile = {
      ...home,
      activity: { ...home.activity, pendingMission: null },
    };

    expect(shortensNextMission(cleared)).toBe(false);
    const second = accept(cleared, cleared.activity.board[0]!.id, 10, NOW + 60_000);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const mission = second.save.activity.mission!;
    expect(mission.endsAt - (NOW + 60_000)).toBe(10 * 60_000);
    expect(isQuickened(mission)).toBe(false);
  });

  it('leaves a player who opted out on the real road', () => {
    const veteran = setOptedOut(save(), true);
    expect(shortensNextMission(veteran)).toBe(false);

    const signed = signFirst(veteran);
    if (!signed.ok) return;
    expect(signed.save.activity.mission!.endsAt - NOW).toBe(10 * 60_000);
  });

  it('counts the signature and the homecoming separately', () => {
    const signed = signFirst(save());
    if (!signed.ok) return;
    expect(tallyOf(signed.save.tasks.lifetime, 'missionsAccepted')).toBe(1);
    expect(tallyOf(signed.save.tasks.lifetime, 'missionsReturned')).toBe(0);

    const home = landMission(signed.save, NOW + FIRST_MISSION_MS);
    expect(tallyOf(home.tasks.lifetime, 'missionsReturned')).toBe(1);

    // Landing again is a no-op: the mission has already moved to the door.
    expect(
      tallyOf(landMission(home, NOW + FIRST_MISSION_MS).tasks.lifetime, 'missionsReturned'),
    ).toBe(1);
  });
});

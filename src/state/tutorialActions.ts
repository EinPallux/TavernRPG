/**
 * Onboarding, as save-to-save transitions (tutorial spec §1, §4).
 *
 * Four small writes, and the smallness is the design. The tutorial's *position* is derived
 * (`engine/tutorial/beats.ts`), so nothing here advances anything — these only record the handful
 * of facts a predicate cannot infer: that somebody looked at a thing, waved a hint away, or said
 * they had been here before.
 */

import type { BeatId, ExplainerId } from '@/data/tutorial';
import type { SaveFile } from '@/engine/save/schema';

function withTutorial(save: SaveFile, patch: Partial<SaveFile['tutorial']>): SaveFile {
  return { ...save, tutorial: { ...save.tutorial, ...patch } };
}

/**
 * "I have been here before", at creation.
 *
 * Deliberately not a fast-forward. The gates still open by level, the glossary still works, the
 * hint chip still appears — the only thing this switches off is the spotlight overlay. A player
 * who opts out and then wants the tour back can turn it on again in Settings without having
 * un-done anything.
 */
export function setOptedOut(save: SaveFile, optedOut: boolean): SaveFile {
  if (save.tutorial.optedOut === optedOut) return save;
  return withTutorial(save, { optedOut });
}

/** Mark a `'read'` beat as seen. The only two beats that need this. */
export function acknowledgeBeat(save: SaveFile, id: BeatId): SaveFile {
  if (save.tutorial.acknowledged.includes(id)) return save;
  return withTutorial(save, { acknowledged: [...save.tutorial.acknowledged, id] });
}

/** Fire a one-time explainer, once. Returns the same save if it has already been seen. */
export function markExplainerSeen(save: SaveFile, id: ExplainerId): SaveFile {
  if (save.tutorial.seenExplainers.includes(id)) return save;
  return withTutorial(save, { seenExplainers: [...save.tutorial.seenExplainers, id] });
}

export function hasSeenExplainer(save: SaveFile, id: ExplainerId): boolean {
  return save.tutorial.seenExplainers.includes(id);
}

/** Wave the Next Step chip away. It stays away until midnight. */
export function dismissHint(save: SaveFile, id: string): SaveFile {
  if (save.tutorial.dismissedHints.includes(id)) return save;
  return withTutorial(save, { dismissedHints: [...save.tutorial.dismissedHints, id] });
}

/**
 * Midnight: the chip gets another go.
 *
 * A hint waved away is a nudge declined, not a preference — the key you did not turn yesterday
 * is still an open door today, and a dismissal that lasted forever would quietly disable the
 * feature after a week of ordinary play.
 */
export function refreshTutorialDay(save: SaveFile): SaveFile {
  if (save.tutorial.dismissedHints.length === 0) return save;
  return withTutorial(save, { dismissedHints: [] });
}

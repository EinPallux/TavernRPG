/**
 * The ladder service (arena spec §5, balancing §10).
 *
 * **One authority over rank and honor.** Player fights (Phase 9) and the thousands of bot-on-bot
 * fights the simulation runs every day both go through `resolveLadderFight`, because the moment
 * there are two implementations there are two sets of rules, and the one the player experiences
 * will not be the one the ladder was balanced against.
 *
 * The rules, from balancing §10:
 * - Beat someone **above** you: you swap places, and take `round(0.02 × their honor)` off them.
 * - Beat someone **below** you: +1 honor, no swap. Down-fighting should be boring.
 * - **Lose** as the attacker: −2% of your own honor, and no rank change.
 *
 * The player sits in the same ladder as the bots, at a sentinel id, so "the player is rank 412"
 * is a fact about one array rather than a separate calculation that can disagree.
 *
 * Pure module.
 */

/** The player's place in the ladder array. Bots are 0…1,499; the player is this. */
export const PLAYER_LADDER_ID = -1;

/** Honor gained for beating someone ranked below you (§10). */
export const DOWN_FIGHT_HONOR = 1;
/** Share of the loser's honor transferred on an upset (§10). */
export const UPSET_HONOR_SHARE = 0.02;
/** Share of your own honor lost when your attack fails (§10). */
export const FAILED_ATTACK_PENALTY = 0.02;

export interface LadderSide {
  readonly id: number;
  readonly honor: number;
}

export interface LadderFight {
  /** Ladder order, best first. Mutated only through the returned value. */
  readonly order: readonly number[];
  readonly attacker: LadderSide;
  readonly defender: LadderSide;
  readonly attackerWon: boolean;
}

export interface LadderOutcome {
  readonly order: readonly number[];
  readonly attackerHonor: number;
  readonly defenderHonor: number;
  /** True when the two actually changed places. */
  readonly swapped: boolean;
  /** Ranks before and after, 1-based, for the feed and the result screen. */
  readonly attackerRankBefore: number;
  readonly attackerRankAfter: number;
  readonly defenderRankBefore: number;
  readonly defenderRankAfter: number;
}

export function rankIn(order: readonly number[], id: number): number {
  const index = order.indexOf(id);
  return index === -1 ? order.length + 1 : index + 1;
}

/**
 * Apply one fight to the ladder.
 *
 * Honor never goes below zero and ranks are only ever exchanged between the two fighters — no
 * fight can reshuffle a third party, which is what keeps a day of five thousand bot fights from
 * being order-dependent in any way the player could notice.
 */
export function resolveLadderFight({
  order,
  attacker,
  defender,
  attackerWon,
}: LadderFight): LadderOutcome {
  const attackerIndex = order.indexOf(attacker.id);
  const defenderIndex = order.indexOf(defender.id);

  const attackerRankBefore = attackerIndex + 1;
  const defenderRankBefore = defenderIndex + 1;

  // Either fighter missing from the ladder means a caller bug; refuse rather than invent a rank.
  if (attackerIndex === -1 || defenderIndex === -1) {
    return {
      order,
      attackerHonor: attacker.honor,
      defenderHonor: defender.honor,
      swapped: false,
      attackerRankBefore,
      attackerRankAfter: attackerRankBefore,
      defenderRankBefore,
      defenderRankAfter: defenderRankBefore,
    };
  }

  if (!attackerWon) {
    // A failed attack costs honor and nothing else. Rank is safe: you cannot fall by attacking.
    const attackerHonor = Math.max(0, Math.round(attacker.honor * (1 - FAILED_ATTACK_PENALTY)));
    return {
      order,
      attackerHonor,
      defenderHonor: defender.honor,
      swapped: false,
      attackerRankBefore,
      attackerRankAfter: attackerRankBefore,
      defenderRankBefore,
      defenderRankAfter: defenderRankBefore,
    };
  }

  // Beating someone below you is worth a token point — enough that it is not *nothing*, little
  // enough that farming the bottom of the ladder is a waste of an afternoon.
  const punchingUp = defenderIndex < attackerIndex;
  if (!punchingUp) {
    return {
      order,
      attackerHonor: attacker.honor + DOWN_FIGHT_HONOR,
      defenderHonor: defender.honor,
      swapped: false,
      attackerRankBefore,
      attackerRankAfter: attackerRankBefore,
      defenderRankBefore,
      defenderRankAfter: defenderRankBefore,
    };
  }

  const transferred = Math.round(defender.honor * UPSET_HONOR_SHARE);
  const next = [...order];
  next[attackerIndex] = defender.id;
  next[defenderIndex] = attacker.id;

  return {
    order: next,
    attackerHonor: attacker.honor + transferred,
    defenderHonor: Math.max(0, defender.honor - transferred),
    swapped: true,
    attackerRankBefore,
    attackerRankAfter: defenderRankBefore,
    defenderRankBefore,
    defenderRankAfter: attackerRankBefore,
  };
}

/**
 * Who a fighter at this rank may attack.
 *
 * A band above them, because the ladder should be climbed rather than jumped, and the arena's
 * opponent draw (Phase 9) reads the same function so the player and the bots fish in the same
 * pond.
 */
export const ATTACK_BAND_UP = 60;
export const ATTACK_BAND_DOWN = 15;

export function attackableRanks(rank: number, size: number): { from: number; to: number } {
  return {
    from: Math.max(1, rank - ATTACK_BAND_UP),
    to: Math.min(size, rank + ATTACK_BAND_DOWN),
  };
}

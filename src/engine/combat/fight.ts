/**
 * The fight resolver (docs/design/systems/combat.md §2).
 *
 * `fight(a, b, seed)` is the whole of combat: one pure function, deterministic for a given
 * seed, emitting a serializable log. Every fight in the game — mission monsters, arena duels,
 * dungeon bosses, later guild content — runs through here, so a balance change is a change in
 * exactly one place.
 *
 * Pure module: no React, no DOM, no clock, no unseeded randomness.
 */

import { createRng, type RngStream, type Seed } from '@/engine/rng';
import {
  CRIT_MULTIPLIER,
  MAX_ROUNDS,
  findProc,
  hasProc,
  type BattleEvent,
  type BattleResult,
  type Combatant,
  type CombatantCard,
  type Side,
  type VerseId,
} from './types';
import { VERSE_IDS, isVerseChangeRound, verseEffect } from './verses';

/** Mutable per-side state for the duration of one fight. */
interface FighterState {
  readonly combatant: Combatant;
  health: number;
  lowestHealth: number;
  damageDealt: number;
  verse: VerseId | null;
  /** Extra damage-reduction cap accumulated by `hardening`. Zero for everything else. */
  extraReduction: number;
}

function card(combatant: Combatant): CombatantCard {
  return {
    id: combatant.id,
    name: combatant.name,
    kind: combatant.kind,
    level: combatant.level,
    maxHealth: combatant.maxHealth,
    ...(combatant.portrait ? { portrait: combatant.portrait } : {}),
  };
}

function other(side: Side): Side {
  return side === 'a' ? 'b' : 'a';
}

/** Crit chance against a given opponent level (balancing §4), as a 0–1 fraction. */
export function critChance(luck: number, opponentLevel: number): number {
  return Math.min(0.5, Math.max(0, (luck * 5) / (2 * Math.max(1, opponentLevel)) / 100));
}

/** Share of a hit absorbed by armour, capped by the defender's class (balancing §4). */
export function damageReduction(armour: number, attackerLevel: number, cap: number): number {
  return Math.min(cap, Math.max(0, armour / (Math.max(1, attackerLevel) * 50)));
}

/**
 * Who swings first. Weighted toward the nimbler fighter but never guaranteed — 60/40 at equal
 * footing widening with the dexterity gap, so initiative is an edge, not a coin flip decided
 * elsewhere (combat spec §2 rule 1).
 */
function rollInitiative(a: Combatant, b: Combatant, rng: RngStream): Side {
  const total = a.attributes.dex + b.attributes.dex;
  const share = total > 0 ? a.attributes.dex / total : 0.5;
  // Pull the raw share toward 0.5 so dexterity tilts the odds rather than dictating them.
  const chance = 0.5 + (share - 0.5) * 0.8;
  return rng.bool(chance) ? 'a' : 'b';
}

export interface FightOptions {
  /** Overrides the round cap; only tests and the balance harness should touch this. */
  readonly maxRounds?: number;
}

export function fight(
  attacker: Combatant,
  defender: Combatant,
  seed: Seed,
  options: FightOptions = {},
): BattleResult {
  const rng = createRng(seed, `combat:${seed}`);
  const maxRounds = options.maxRounds ?? MAX_ROUNDS;

  const state: Record<Side, FighterState> = {
    a: {
      combatant: attacker,
      health: attacker.maxHealth,
      lowestHealth: attacker.maxHealth,
      damageDealt: 0,
      verse: null,
      extraReduction: 0,
    },
    b: {
      combatant: defender,
      health: defender.maxHealth,
      lowestHealth: defender.maxHealth,
      damageDealt: 0,
      verse: null,
      extraReduction: 0,
    },
  };

  const log: BattleEvent[] = [];
  const first = rollInitiative(attacker, defender, rng);
  log.push({ t: 'battle_start', a: card(attacker), b: card(defender), first });

  // A boss names its trick before it uses it. Never mid-fight: an explainer that arrives with
  // the blow that killed you is a post-mortem, not a warning.
  for (const side of ['a', 'b'] as Side[]) {
    const { signature } = state[side].combatant;
    if (signature) {
      log.push({ t: 'boss_trait', side, label: signature.label, explainer: signature.explainer });
    }
  }

  /**
   * The Margrave's answer to a defence.
   *
   * Fires on block, dodge and miss alike — every way an attack can fail to land — because the
   * lesson the floor is teaching is "stop feeding it", and a heal that only answered one of the
   * three would read as random. Capped at full health so it cannot exceed the bar it is filling.
   */
  const siphon = (side: Side): void => {
    const self = state[side];
    const proc = findProc(self.combatant, 'siphon');
    if (!proc || self.health <= 0) return;

    const healed = Math.min(
      self.combatant.maxHealth - self.health,
      Math.round(self.combatant.maxHealth * proc.healShare),
    );
    if (healed <= 0) return;

    self.health += healed;
    log.push({ t: 'heal', target: side, amount: healed, hpAfter: self.health });
  };

  /** Resolve one swing. Returns true if the target was knocked out. */
  const swing = (source: Side, followUp = false): boolean => {
    const self = state[source];
    const target = state[other(source)];
    const me = self.combatant;
    const them = target.combatant;

    const myVerse = verseEffect(self.verse);
    const theirVerse = verseEffect(target.verse);

    // Discord makes the *opponent* miss — checked before anything else.
    if (theirVerse.enemyMissChance > 0 && rng.bool(theirVerse.enemyMissChance)) {
      log.push({ t: 'missed', source });
      siphon(other(source));
      return false;
    }

    /**
     * Arcane Certainty halves the defender's block and dodge rather than nullifying them.
     *
     * Full nullification was the cleaner rule to write down, but the harness measured it as a
     * 97% hard counter to the Hunter — an arena where your class simply loses is miserable.
     * 0.62 keeps the identity ("magic is hard to dodge") while capping the worst matchup in
     * the game near 65%.
     */
    const defenceMultiplier = hasProc(me, 'arcane-certainty') ? 0.62 : 1;

    const block = findProc(them, 'block');
    if (block && rng.bool(block.chance * defenceMultiplier)) {
      log.push({ t: 'blocked', target: other(source) });
      siphon(other(source));
      return false;
    }
    const dodge = findProc(them, 'dodge');
    if (dodge && rng.bool(dodge.chance * defenceMultiplier)) {
      log.push({ t: 'dodged', target: other(source) });
      siphon(other(source));
      return false;
    }

    const roll = rng.float(me.weapon.min, me.weapon.max);
    const statMultiplier = 1 + me.attributes[me.mainStat] / 10;
    const crit = rng.bool(critChance(me.attributes.lck, them.level));

    const doubleStrike = findProc(me, 'double-strike');
    const followUpMultiplier = followUp ? (doubleStrike?.damageMultiplier ?? 1) : 1;

    const raw =
      roll *
      statMultiplier *
      (crit ? CRIT_MULTIPLIER : 1) *
      followUpMultiplier *
      myVerse.damageMultiplier;

    // Hardening raises the *cap*, not the armour — a boss that thickens still cannot become
    // immune, because the armour behind the cap is what has to reach it.
    const cap = them.damageReductionCap + target.extraReduction;
    const reduction = damageReduction(them.armour, me.level, cap);
    const afterArmour = raw * (1 - reduction) * (1 - theirVerse.damageReduction);
    const final = Math.max(1, Math.round(afterArmour));

    log.push({
      t: 'attack',
      source,
      raw: Math.round(raw),
      final,
      crit,
      ...(followUp ? { followUp: true } : {}),
    });

    const before = target.health;
    target.health = Math.max(0, before - final);
    target.lowestHealth = Math.min(target.lowestHealth, target.health);
    self.damageDealt += Math.min(before, final);

    log.push({
      t: 'damage',
      target: other(source),
      amount: final,
      hpAfter: target.health,
      ...(final > before ? { overkill: final - before } : {}),
    });

    if (target.health <= 0) {
      log.push({ t: 'ko', target: other(source) });
      return true;
    }
    return false;
  };

  /**
   * The swarm's hit. Returns true if it finished the fight.
   *
   * Deliberately unavoidable — no block, no dodge, no crit. A rat swarm is not something you
   * parry, and making it dodgeable would turn the floor's one memorable mechanic into another
   * roll the player watches happen to them. It still goes through armour, so gear answers it.
   */
  const callSwarm = (source: Side, label: string, share: number): boolean => {
    const self = state[source];
    const target = state[other(source)];
    const me = self.combatant;
    const them = target.combatant;

    log.push({ t: 'swarm', source, label });

    const roll = rng.float(me.weapon.min, me.weapon.max);
    const raw = roll * (1 + me.attributes[me.mainStat] / 10) * share;
    const cap = them.damageReductionCap + target.extraReduction;
    const final = Math.max(1, Math.round(raw * (1 - damageReduction(them.armour, me.level, cap))));

    const before = target.health;
    target.health = Math.max(0, before - final);
    target.lowestHealth = Math.min(target.lowestHealth, target.health);
    self.damageDealt += Math.min(before, final);

    log.push({
      t: 'damage',
      target: other(source),
      amount: final,
      hpAfter: target.health,
      ...(final > before ? { overkill: final - before } : {}),
    });

    if (target.health <= 0) {
      log.push({ t: 'ko', target: other(source) });
      return true;
    }
    return false;
  };

  /** One fighter's full turn: the swing, plus any follow-up their kit grants. */
  const takeTurn = (source: Side): boolean => {
    if (swing(source)) return true;

    const doubleStrike = findProc(state[source].combatant, 'double-strike');
    if (doubleStrike && rng.bool(doubleStrike.chance)) {
      if (swing(source, true)) return true;
    }
    return false;
  };

  let round = 0;
  let finished = false;
  let winner: Side = first;
  let reason: 'knockout' | 'round_limit' = 'knockout';

  while (!finished && round < maxRounds) {
    round += 1;
    log.push({ t: 'round_start', n: round });

    // Verses re-roll at the start of rounds 1, 5, 9 … for whoever has the kit.
    if (isVerseChangeRound(round)) {
      for (const side of ['a', 'b'] as Side[]) {
        if (hasProc(state[side].combatant, 'verses')) {
          const verse = rng.pick(VERSE_IDS);
          state[side].verse = verse;
          log.push({ t: 'verse_change', side, verse });
        }
      }
    }

    // Boss signatures resolve before the exchange, so the round the armour thickens is the round
    // it thickens — not the one after, when the player has already read the number.
    for (const side of ['a', 'b'] as Side[]) {
      const harden = findProc(state[side].combatant, 'hardening');
      if (harden && state[side].extraReduction < harden.cap) {
        state[side].extraReduction = Math.min(harden.cap, state[side].extraReduction + harden.perRound);
        log.push({ t: 'harden', side, reduction: state[side].extraReduction });
      }
    }

    let swarmed = false;
    for (const side of ['a', 'b'] as Side[]) {
      const swarm = findProc(state[side].combatant, 'swarm-call');
      if (!swarm || round % Math.max(1, swarm.everyRounds) !== 0) continue;
      if (callSwarm(side, state[side].combatant.signature?.label ?? 'The swarm', swarm.damageShare)) {
        winner = side;
        finished = true;
        swarmed = true;
        break;
      }
    }
    if (swarmed) break;

    const order: Side[] = first === 'a' ? ['a', 'b'] : ['b', 'a'];
    for (const side of order) {
      if (takeTurn(side)) {
        winner = side;
        finished = true;
        break;
      }
    }
  }

  if (!finished) {
    // Out of rounds: whoever kept more of their health wins. An exact tie goes to the
    // defender, so the fighter who picked the fight carries the risk (combat spec §2 rule 3).
    reason = 'round_limit';
    const fractionA = state.a.health / Math.max(1, attacker.maxHealth);
    const fractionB = state.b.health / Math.max(1, defender.maxHealth);
    winner = fractionA > fractionB ? 'a' : 'b';
  }

  log.push({ t: 'battle_end', winner, rounds: round, reason });

  return {
    winner,
    winnerId: state[winner].combatant.id,
    loserId: state[other(winner)].combatant.id,
    rounds: round,
    log,
    remainingHealth: { a: state.a.health, b: state.b.health },
    lowestHealth: { a: state.a.lowestHealth, b: state.b.lowestHealth },
    totalDamage: { a: state.a.damageDealt, b: state.b.damageDealt },
    reason,
  };
}

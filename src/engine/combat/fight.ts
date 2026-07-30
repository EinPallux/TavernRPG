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
  type CombatModifiers,
  type Side,
  type VerseId,
} from './types';
import { VERSE_IDS, isVerseChangeRound, verseEffect } from './verses';

/**
 * A fighter with no gear sets.
 *
 * Declared here rather than imported from `items/sets.ts` because the resolver imports nothing —
 * that rule is what makes a fight reproducible from a seed and a snapshot alone. The folding
 * lives with the items; the zero lives with the reader.
 */
const NO_SET_MODIFIERS: CombatModifiers = {
  damage: 0,
  armour: 0,
  health: 0,
  crit: 0,
  critDamage: 0,
  block: 0,
  dodge: 0,
  doubleStrike: 0,
  followUpDamage: 0,
  healthyDamage: null,
  verseLength: 0,
  verseDamage: 0,
  verseHeal: 0,
  discord: 0,
  chooseVerse: false,
  reflect: 0,
  lifesteal: 0,
  absorb: null,
  dodgeFury: null,
  counter: 0,
  shred: null,
  thirdStrike: null,
  firstStrikeCrit: false,
  steady: 0,
  execute: 0,
};

/** Mutable per-side state for the duration of one fight. */
interface FighterState {
  readonly combatant: Combatant;
  health: number;
  lowestHealth: number;
  damageDealt: number;
  verse: VerseId | null;
  /** Extra damage-reduction cap accumulated by `hardening`. Zero for everything else. */
  extraReduction: number;
  /*
   * ── Set-bonus bookkeeping ────────────────────────────────────────────────────────
   *
   * Every one of these exists because its bonus is *bounded* (gear-sets spec §3): a five-piece
   * is meant to be strong enough to chase for weeks and never strong enough to be the whole
   * fight, so each one is capped by a stack count or spent on first use. Keeping the counters
   * on the per-fight state rather than the combatant is what makes that true per battle rather
   * than per save.
   */
  /** Dodge-fury stacks (Thornstalker 4), spent on the next hit. */
  dodgeStacks: number;
  /** Armour points stripped from the *opponent* by crits (Galewind 5). */
  shredStacks: number;
  /** Absorb shield remaining (Tidecaller 5). */
  shield: number;
  /** Once-a-battle flags. */
  shieldSpent: boolean;
  executeSpent: boolean;
  firstStrikeSpent: boolean;
  /** Counter-shot is once a round, not once a battle. */
  counteredThisRound: boolean;
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
      dodgeStacks: 0,
      shredStacks: 0,
      shield: 0,
      shieldSpent: false,
      executeSpent: false,
      firstStrikeSpent: false,
      counteredThisRound: false,
    },
    b: {
      combatant: defender,
      health: defender.maxHealth,
      lowestHealth: defender.maxHealth,
      damageDealt: 0,
      verse: null,
      extraReduction: 0,
      dodgeStacks: 0,
      shredStacks: 0,
      shield: 0,
      shieldSpent: false,
      executeSpent: false,
      firstStrikeSpent: false,
      counteredThisRound: false,
    },
  };

  /** A fighter's set bonuses, or none. Read constantly, so resolved once. */
  const mods = (side: Side): CombatModifiers => state[side].combatant.modifiers ?? NO_SET_MODIFIERS;

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

  /**
   * Apply damage to a fighter, through any shield they are carrying.
   *
   * One place, so the absorb shield (Tidecaller 5) cannot be forgotten by a new damage source —
   * the swarm and the counter-shot both arrived after it and both get it for free.
   */
  const applyDamage = (side: Side, amount: number, from: Side): boolean => {
    const target = state[side];
    let landing = amount;

    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, landing);
      target.shield -= absorbed;
      landing -= absorbed;
    }

    const before = target.health;
    target.health = Math.max(0, before - landing);
    target.lowestHealth = Math.min(target.lowestHealth, target.health);
    state[from].damageDealt += Math.min(before, landing);

    log.push({
      t: 'damage',
      target: side,
      amount: landing,
      hpAfter: target.health,
      ...(landing > before ? { overkill: landing - before } : {}),
    });

    // The tide answers on the way down, not on the way back up: the shield is checked *after*
    // the blow that took them under, so it buys the next hit rather than un-doing this one.
    const absorb = mods(side).absorb;
    if (absorb && !target.shieldSpent && target.health > 0) {
      if (target.health / Math.max(1, target.combatant.maxHealth) < absorb.threshold) {
        target.shieldSpent = true;
        target.shield = Math.round(target.combatant.maxHealth * absorb.share);
        log.push({ t: 'set_proc', side, effect: 'absorb', label: 'The tide holds', amount: target.shield });
      }
    }

    if (target.health <= 0) {
      log.push({ t: 'ko', target: side });
      return true;
    }
    return false;
  };

  /** Mend a fighter, capped at full. Returns what actually landed. */
  const mend = (side: Side, amount: number): number => {
    const self = state[side];
    const healed = Math.min(self.combatant.maxHealth - self.health, Math.max(0, Math.round(amount)));
    if (healed > 0) self.health += healed;
    return healed;
  };

  /** Resolve one swing. Returns true if the target was knocked out. */
  const swing = (source: Side, followUp = false, extraShare = 1): boolean => {
    const self = state[source];
    const target = state[other(source)];
    const me = self.combatant;
    const them = target.combatant;
    const mine = mods(source);
    const theirs = mods(other(source));

    const myVerse = verseEffect(self.verse);
    const theirVerse = verseEffect(target.verse);

    // Discord makes the *opponent* miss — checked before anything else. Dawnchorus 5 widens it.
    const missChance =
      theirVerse.enemyMissChance > 0 ? theirVerse.enemyMissChance + theirs.discord : 0;
    if (missChance > 0 && rng.bool(missChance)) {
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
    const blockChance = block ? block.chance + theirs.block : 0;
    if (blockChance > 0 && rng.bool(blockChance * defenceMultiplier)) {
      log.push({ t: 'blocked', target: other(source) });
      siphon(other(source));

      /*
       * Oathsworn 4: a block throws back a share of what it stopped.
       *
       * Priced off the swing that *would* have landed rather than a flat number, so the bonus
       * scales with the thing it is defending against — reflecting 15% of a rat's bite should
       * not be worth the same as reflecting 15% of a boss's.
       */
      if (theirs.reflect > 0) {
        const prevented = rng.float(me.weapon.min, me.weapon.max) * (1 + me.attributes[me.mainStat] / 10);
        const thrown = Math.max(1, Math.round(prevented * theirs.reflect));
        log.push({ t: 'set_proc', side: other(source), effect: 'reflect', label: 'Turned aside', amount: thrown });
        if (applyDamage(source, thrown, other(source))) return false;
      }
      return false;
    }

    const dodge = findProc(them, 'dodge');
    const dodgeChance = dodge ? dodge.chance + theirs.dodge : theirs.dodge;
    if (dodgeChance > 0 && rng.bool(dodgeChance * defenceMultiplier)) {
      log.push({ t: 'dodged', target: other(source) });
      siphon(other(source));

      // Thornstalker 4: a dodge sharpens the next hit, up to its cap.
      if (theirs.dodgeFury) {
        target.dodgeStacks = Math.min(theirs.dodgeFury.stacks, target.dodgeStacks + 1);
      }

      /*
       * Thornstalker 5: and answers with a free shot — once a round, so a dodge-heavy build
       * cannot turn a long fight into an uninterrupted counter-attack.
       */
      if (theirs.counter > 0 && !target.counteredThisRound && target.health > 0) {
        target.counteredThisRound = true;
        log.push({
          t: 'set_proc',
          side: other(source),
          effect: 'counter',
          label: 'Counter-shot',
          amount: Math.round(theirs.counter * 100),
        });
        if (swing(other(source), false, theirs.counter)) return false;
      }
      return false;
    }

    /*
     * Emberweave 5 lifts the *bottom* of the roll toward its middle rather than raising damage.
     *
     * The capstone is consistency, so it has to be spent on variance: a Mage whose worst swing
     * stops being catastrophic is a different fighter from one who simply hits harder, and the
     * second of those is what "+8% damage" already buys at two pieces.
     */
    const mid = (me.weapon.min + me.weapon.max) / 2;
    const floor = me.weapon.min + (mid - me.weapon.min) * mine.steady;
    const roll = rng.float(floor, me.weapon.max);

    const statMultiplier = 1 + me.attributes[me.mainStat] / 10;

    // Nighttide 5: the first blow of the battle is a certainty, not a roll.
    const guaranteed = mine.firstStrikeCrit && !self.firstStrikeSpent;
    if (mine.firstStrikeCrit) self.firstStrikeSpent = true;
    const crit = guaranteed || rng.bool(critChance(me.attributes.lck, them.level) + mine.crit);

    const doubleStrike = findProc(me, 'double-strike');
    const followUpMultiplier = followUp
      ? (doubleStrike?.damageMultiplier ?? 1) * (1 + mine.followUpDamage)
      : 1;

    // Dodge-fury is spent on the swing that follows it, whatever kind of swing that is.
    const fury = mine.dodgeFury ? 1 + self.dodgeStacks * mine.dodgeFury.share : 1;
    self.dodgeStacks = 0;

    const healthy =
      mine.healthyDamage && self.health / Math.max(1, me.maxHealth) > mine.healthyDamage.above
        ? 1 + mine.healthyDamage.share
        : 1;
    const versed = self.verse !== null ? 1 + mine.verseDamage : 1;

    const raw =
      roll *
      statMultiplier *
      (crit ? CRIT_MULTIPLIER + mine.critDamage : 1) *
      followUpMultiplier *
      extraShare *
      fury *
      healthy *
      versed *
      (1 + mine.damage) *
      myVerse.damageMultiplier;

    // Hardening raises the *cap*, not the armour — a boss that thickens still cannot become
    // immune, because the armour behind the cap is what has to reach it. Galewind 5 pulls the
    // other way, stripping points off it.
    const shred = mine.shred ? self.shredStacks * mine.shred.points : 0;
    const cap = Math.max(0, them.damageReductionCap + target.extraReduction - shred);
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

    // Galewind 5: each crit peels another layer, to the cap.
    if (crit && mine.shred && self.shredStacks < mine.shred.stacks) {
      self.shredStacks += 1;
      log.push({
        t: 'set_proc',
        side: source,
        effect: 'shred',
        label: 'Armour peeled',
        amount: Math.round(self.shredStacks * mine.shred.points * 100),
      });
    }

    const killed = applyDamage(other(source), final, source);

    // Tidecaller 4: a share of what you dealt comes back. After the blow, so a killing hit still
    // heals — it is a tithe on damage, not a reward for the target surviving.
    if (mine.lifesteal > 0 && self.health > 0) {
      const mended = mend(source, final * mine.lifesteal);
      if (mended > 0) {
        log.push({ t: 'set_proc', side: source, effect: 'lifesteal', label: 'Undertow', amount: mended });
        log.push({ t: 'heal', target: source, amount: mended, hpAfter: self.health });
      }
    }

    if (killed) return true;

    /*
     * Wolfblood 5: the first time they are driven under a quarter, swing again at once.
     *
     * Spent on use rather than per round, so it is one extra attack a battle at the moment it
     * matters most — the execute window — and never a second damage phase.
     */
    if (mine.execute > 0 && !self.executeSpent) {
      if (target.health / Math.max(1, them.maxHealth) < mine.execute) {
        self.executeSpent = true;
        log.push({ t: 'set_proc', side: source, effect: 'execute', label: 'Blood in the water', amount: 1 });
        if (swing(source)) return true;
      }
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

    return applyDamage(other(source), final, source);
  };

  /** One fighter's full turn: the swing, plus any follow-up their kit grants. */
  const takeTurn = (source: Side): boolean => {
    if (swing(source)) return true;

    const mine = mods(source);
    const doubleStrike = findProc(state[source].combatant, 'double-strike');
    if (!doubleStrike) return false;

    // Corsair 2 widens the flurry; Corsair 5 lets it carry into a third.
    if (!rng.bool(doubleStrike.chance + mine.doubleStrike)) return false;
    if (swing(source, true)) return true;

    if (mine.thirdStrike && rng.bool(mine.thirdStrike.chance)) {
      log.push({
        t: 'set_proc',
        side: source,
        effect: 'third-strike',
        label: 'And a third',
        amount: Math.round(mine.thirdStrike.share * 100),
      });
      if (swing(source, true, mine.thirdStrike.share)) return true;
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

    // A counter-shot is once a round; the round is where it resets.
    state.a.counteredThisRound = false;
    state.b.counteredThisRound = false;

    /*
     * Verses re-roll at the start of rounds 1, 5, 9 … for whoever has the kit.
     *
     * Maestro 2 stretches the period, which is why the change round is asked per side rather
     * than once: two Bards with different sets change on different rounds, and the shared
     * `isVerseChangeRound(round)` could only ever answer for one of them.
     */
    for (const side of ['a', 'b'] as Side[]) {
      const self = state[side];
      if (!hasProc(self.combatant, 'verses')) continue;
      const mine = mods(side);
      if (!isVerseChangeRound(round, mine.verseLength)) continue;

      // Maestro 5: on the opening round, the player's choice stands in for the roll.
      const chosen = round === 1 ? self.combatant.openingVerse : undefined;
      const verse = mine.chooseVerse && chosen ? chosen : rng.pick(VERSE_IDS);
      const changed = self.verse !== null;
      self.verse = verse;
      log.push({ t: 'verse_change', side, verse });

      // Dawnchorus 4 mends on every *change*, so the opening verse is not a free heal.
      if (changed && mine.verseHeal > 0) {
        const mended = mend(side, self.combatant.maxHealth * mine.verseHeal);
        if (mended > 0) {
          log.push({ t: 'set_proc', side, effect: 'verse-heal', label: 'Dawnchorus', amount: mended });
          log.push({ t: 'heal', target: side, amount: mended, hpAfter: self.health });
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

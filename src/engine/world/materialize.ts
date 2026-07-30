/**
 * Turning a bot record into something you can fight (world-simulation spec §1, §8).
 *
 * The design goal this file exists to satisfy is "**plausible at a glance, fair under
 * inspection**": a bot's stat block comes off the same curves a player's does, so opening a
 * profile shows a believable hero and fighting one runs the real combat engine against real
 * numbers. Nothing is faked and no outcome is pre-decided.
 *
 * The only thing separating two level-40 bots is `gearScore` — how far ahead of or behind the
 * level baseline their kit is. That is what a hoarder's advantage actually looks like in a game
 * where everyone shares one item budget.
 *
 * Pure module.
 */

import { classDef } from '@/data/classes';
import {
  baselineArmour,
  baselineWeaponDamage,
  monsterStatBudget,
  procsForClass,
} from '@/engine/combat/combatant';
import type { Combatant } from '@/engine/combat/types';
import type { Attributes } from '@/engine/progression/stats';
import { botIdentity, type BotIdentity } from './identity';
import type { BotRecord } from './generate';

/**
 * Build the combatant for a bot.
 *
 * Deliberately the same shape as `buildReferenceCombatant`: same stat budget, same 62/28/10
 * split, same weapon and armour curves. The bot is a reference hero at their level, scaled by
 * their gear score — which means the balance harness's guarantees about class win rates apply
 * to bot fights for free, rather than needing a second set of bands nobody would maintain.
 */
export function materializeBot(
  worldSeed: number,
  record: BotRecord,
  identity: BotIdentity = botIdentity(worldSeed, record.id),
): Combatant {
  const definition = classDef(identity.classId);
  const level = Math.max(1, Math.floor(record.level));
  const gear = record.gearScore;

  const budget = monsterStatBudget(level);
  const base = definition.startingStats;

  // Attribute training is level-driven; gear is what the gear score moves. Splitting them keeps
  // a badly-geared bot dangerous rather than harmless — they have still been playing.
  const attributes: Attributes = {
    ...base,
    [definition.mainStat]: base[definition.mainStat] + Math.round(budget * 0.62 * gear),
    con: base.con + Math.round(budget * 0.28 * gear),
    lck: base.lck + Math.round(budget * 0.1 * gear),
  };

  const baseline = baselineWeaponDamage(level);
  const average = ((baseline.min + baseline.max) / 2) * definition.weaponDamageFactor * gear;

  return {
    id: `bot-${record.id}`,
    name: identity.name,
    kind: definition.name,
    level,
    maxHealth: Math.round(attributes.con * (level + 1) * definition.hpFactor),
    attributes,
    mainStat: definition.mainStat,
    weapon: {
      min: Math.max(1, Math.round(average * (1 - definition.weaponSpread))),
      max: Math.max(2, Math.round(average * (1 + definition.weaponSpread))),
    },
    armour: Math.round(baselineArmour(level) * gear),
    damageReductionCap: definition.drCap,
    procs: procsForClass(identity.classId),
    portrait: definition.portrait,
  };
}

/**
 * A bot's profile as the Hall of Fame and the arena preview show it.
 *
 * Bots deliberately have **no per-bot art** (CLAUDE.md rule 5) — they use their class portrait,
 * the same one the player's own class uses. Fifteen hundred generated faces would be fifteen
 * hundred chances to look wrong.
 */
export interface BotProfile {
  readonly id: number;
  readonly name: string;
  readonly classId: BotIdentity['classId'];
  readonly level: number;
  readonly honor: number;
  readonly guildId: number;
  readonly portrait: string;
  readonly legend: boolean;
  readonly dormant: boolean;
  /** Rough power for a "is this fight worth it?" read, not a combat input. */
  readonly gearScore: number;
}

export function botProfile(
  worldSeed: number,
  record: BotRecord,
  now: number,
  identity: BotIdentity = botIdentity(worldSeed, record.id),
): BotProfile {
  return {
    id: record.id,
    name: identity.name,
    classId: identity.classId,
    level: record.level,
    honor: record.honor,
    guildId: record.guildId,
    portrait: classDef(identity.classId).portrait,
    legend: identity.legend,
    dormant: record.dormantUntil > now,
    gearScore: record.gearScore,
  };
}

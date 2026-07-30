/**
 * Golden logs (combat spec §7).
 *
 * These freeze the engine's exact output for a handful of fixed fights. They are not testing
 * that the numbers are *good* — the balance suite does that — but that they do not change by
 * accident. A diff here means every committed seed in every save now resolves differently:
 * mission outcomes players already saw, arena replays, dungeon attempts.
 *
 * If a diff is intentional, it belongs in a phase that says so in the changelog.
 */

import { describe, expect, it } from 'vitest';
import { buildMonsterCombatant, buildReferenceCombatant } from './combatant';
import { fight } from './fight';
import type { BattleEvent } from './types';

/** Compact one-line-per-event rendering, so a snapshot diff is readable by a human. */
function render(log: readonly BattleEvent[]): string[] {
  return log.map((event) => {
    switch (event.t) {
      case 'battle_start':
        return `start ${event.a.name}(${event.a.maxHealth}) vs ${event.b.name}(${event.b.maxHealth}) first=${event.first}`;
      case 'round_start':
        return `-- round ${event.n}`;
      case 'verse_change':
        return `${event.side} verse ${event.verse}`;
      case 'attack':
        return `${event.source} attack raw=${event.raw} final=${event.final}${event.crit ? ' CRIT' : ''}${event.followUp ? ' followup' : ''}`;
      case 'blocked':
        return `${event.target} blocked`;
      case 'dodged':
        return `${event.target} dodged`;
      case 'missed':
        return `${event.source} missed`;
      case 'boss_trait':
        return `${event.side} trait "${event.label}"`;
      case 'swarm':
        return `${event.source} swarm "${event.label}"`;
      case 'heal':
        return `${event.target} +${event.amount} => ${event.hpAfter}`;
      case 'harden':
        return `${event.side} harden +${Math.round(event.reduction * 100)}pp`;
      case 'damage':
        return `${event.target} -${event.amount} => ${event.hpAfter}`;
      case 'ko':
        return `${event.target} KO`;
      case 'battle_end':
        return `end winner=${event.winner} rounds=${event.rounds} (${event.reason})`;
    }
  });
}

describe('golden battle logs', () => {
  it('warrior vs mission bruiser', () => {
    const result = fight(
      buildReferenceCombatant('warrior', 12, 'hero'),
      buildMonsterCombatant({
        id: 'boar',
        name: 'Sootback Boar',
        archetypeId: 'bruiser',
        level: 12,
      }),
      1234,
    );
    expect(render(result.log)).toMatchSnapshot();
  });

  it('bard vs hunter, so the Verse machinery is frozen too', () => {
    const result = fight(
      buildReferenceCombatant('bard', 30, 'bard'),
      buildReferenceCombatant('hunter', 30, 'hunter'),
      555,
    );
    expect(render(result.log)).toMatchSnapshot();
  });

  it('mage vs warrior, the sharpest counter in the game', () => {
    const result = fight(
      buildReferenceCombatant('mage', 25, 'mage'),
      buildReferenceCombatant('warrior', 25, 'warrior'),
      99,
    );
    expect(render(result.log)).toMatchSnapshot();
  });

  it('swashbuckler vs dungeon boss', () => {
    const result = fight(
      buildReferenceCombatant('swashbuckler', 40, 'hero'),
      buildMonsterCombatant({
        id: 'margrave',
        name: 'The Pale Margrave',
        archetypeId: 'tank',
        level: 44,
        budgetMultiplier: 1.6,
      }),
      2026,
    );
    expect(render(result.log)).toMatchSnapshot();
  });

  it('freezes the reference combatants themselves', () => {
    // If a class constant moves, this catches it before the logs even diverge.
    const summary = (['warrior', 'bard', 'mage', 'hunter', 'swashbuckler'] as const).map((id) => {
      const combatant = buildReferenceCombatant(id, 25);
      return `${id}: hp=${combatant.maxHealth} dmg=${combatant.weapon.min}-${combatant.weapon.max} armour=${combatant.armour} drCap=${combatant.damageReductionCap}`;
    });
    expect(summary).toMatchSnapshot();
  });
});

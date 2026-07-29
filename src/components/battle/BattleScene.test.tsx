// @vitest-environment jsdom

/**
 * Battle scene render tests.
 *
 * The scene's contract is that it can draw *any* valid log. Since logs come from a seeded
 * engine, the risk is never "the code path I wrote a fixture for" — it is the twelfth event
 * type in an order nobody anticipated. So the important test here is the fuzz one: real fights
 * across every class, archetype and level, each scrubbed frame by frame, none allowed to throw.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CLASSES } from '@/data/classes';
import { ARCHETYPES } from '@/data/monsterArchetypes';
import { buildMonsterCombatant, buildReferenceCombatant } from '@/engine/combat/combatant';
import { fight } from '@/engine/combat/fight';
import type { BattleEvent, CombatantCard } from '@/engine/combat/types';
import { BattleScene } from './BattleScene';
import { buildTimeline, frameAt } from './timeline';

afterEach(cleanup);

const CARD_A: CombatantCard = { id: 'a', name: 'Wren', kind: 'Hunter', level: 12, maxHealth: 300 };
const CARD_B: CombatantCard = {
  id: 'b',
  name: 'Bog Lurker',
  kind: 'Swarm',
  level: 12,
  maxHealth: 180,
};

const SIMPLE: BattleEvent[] = [
  { t: 'battle_start', a: CARD_A, b: CARD_B, first: 'a' },
  { t: 'round_start', n: 1 },
  { t: 'verse_change', side: 'a', verse: 'battle-hymn' },
  { t: 'attack', source: 'a', raw: 120, final: 100, crit: true },
  { t: 'damage', target: 'b', amount: 100, hpAfter: 80 },
  { t: 'blocked', target: 'a' },
  { t: 'dodged', target: 'b' },
  { t: 'missed', source: 'b' },
  { t: 'attack', source: 'a', raw: 90, final: 80, crit: false },
  { t: 'damage', target: 'b', amount: 80, hpAfter: 0 },
  { t: 'ko', target: 'b' },
  { t: 'battle_end', winner: 'a', rounds: 1, reason: 'knockout' },
];

describe('BattleScene', () => {
  it('puts both fighters, their health and the controls on the stage', () => {
    render(<BattleScene log={SIMPLE} />);

    expect(screen.getByTestId('battle-scene')).toBeInTheDocument();
    expect(screen.getByTestId('fighter-a')).toHaveTextContent('Wren');
    expect(screen.getByTestId('fighter-b')).toHaveTextContent('Bog Lurker');
    expect(screen.getByTestId('health-a')).toHaveAttribute('aria-valuemax', '300');
    expect(screen.getByTestId('battle-speed-1')).toBeInTheDocument();
    expect(screen.getByTestId('battle-speed-4')).toBeInTheDocument();
  });

  it('renders nothing rather than half a stage when the log has no opening', () => {
    const { container } = render(<BattleScene log={[{ t: 'round_start', n: 1 }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens on the result screen when told to start finished', () => {
    render(<BattleScene log={SIMPLE} startFinished result={<p>Spoils await</p>} />);

    expect(screen.getByTestId('battle-result-layer')).toBeInTheDocument();
    expect(screen.getByText('Spoils await')).toBeInTheDocument();
    // Finishing swaps Skip for Replay — there is nothing left to skip.
    expect(screen.getByTestId('battle-replay')).toBeInTheDocument();
  });

  it('hides the result until the fight has actually played', () => {
    render(<BattleScene log={SIMPLE} result={<p>Spoils await</p>} />);

    expect(screen.queryByTestId('battle-result-layer')).not.toBeInTheDocument();
    expect(screen.getByTestId('battle-skip')).toBeInTheDocument();
  });

  it('reports the speed the player picked so it can be remembered', () => {
    const onSpeedChange = vi.fn();

    render(<BattleScene log={SIMPLE} onSpeedChange={onSpeedChange} />);
    // Mounting must not write a preference nobody chose.
    expect(onSpeedChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('battle-speed-4'));

    expect(onSpeedChange).toHaveBeenCalledWith(4);
    expect(screen.getByTestId('battle-speed-4')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('battle-speed-1')).toHaveAttribute('aria-pressed', 'false');
  });

  it('jumps to the end when the fight is skipped', () => {
    const onFinished = vi.fn();

    render(<BattleScene log={SIMPLE} onFinished={onFinished} result={<p>Spoils await</p>} />);

    fireEvent.click(screen.getByTestId('battle-skip'));

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('battle-result-layer')).toBeInTheDocument();
    expect(screen.getByTestId('battle-replay')).toBeInTheDocument();
  });

  it('replays from the top without re-announcing the finish', () => {
    const onFinished = vi.fn();

    render(<BattleScene log={SIMPLE} startFinished onFinished={onFinished} />);
    fireEvent.click(screen.getByTestId('battle-replay'));

    // Back at the start: there is something to skip again.
    expect(screen.getByTestId('battle-skip')).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
  });
});

describe('fuzz — every fight the engine can produce is renderable', () => {
  /** Every class against every archetype, across the level bands, is the real input space. */
  const matchups = CLASSES.flatMap((definition) =>
    ARCHETYPES.flatMap((template) =>
      [1, 17, 60].map((level) => ({ classId: definition.id, archetypeId: template.id, level })),
    ),
  );

  it('renders a frame from every point in every fight without throwing', () => {
    for (const [index, matchup] of matchups.entries()) {
      const result = fight(
        buildReferenceCombatant(matchup.classId, matchup.level, 'hero'),
        buildMonsterCombatant({
          id: matchup.archetypeId,
          name: 'Fuzzed Foe',
          archetypeId: matchup.archetypeId,
          level: matchup.level,
        }),
        index + 1,
      );

      const timeline = buildTimeline(result.log);
      const label = `${matchup.classId} vs ${matchup.archetypeId} @${matchup.level}`;

      // Scrub the whole fight. Any moment must produce a drawable frame.
      for (let t = 0; t <= timeline.duration; t += 23) {
        expect(() => frameAt(timeline, t), `${label} @${t}ms`).not.toThrow();
      }

      // And the scene itself must mount on that log.
      expect(() => {
        const view = render(<BattleScene log={result.log} startFinished />);
        view.unmount();
      }, label).not.toThrow();
    }
  });

  it('survives logs the engine would never emit — truncated, reordered, empty', () => {
    const wrecked: BattleEvent[][] = [
      [],
      [SIMPLE[0]!],
      // Damage with no attack in front of it.
      [SIMPLE[0]!, { t: 'damage', target: 'b', amount: 50, hpAfter: 130 }],
      // A knockout with nothing after it.
      [SIMPLE[0]!, { t: 'ko', target: 'a' }],
      // Events in reverse, which is nonsense but must not crash.
      [...SIMPLE].reverse(),
      // Both fighters down.
      [SIMPLE[0]!, { t: 'ko', target: 'a' }, { t: 'ko', target: 'b' }],
    ];

    for (const [index, log] of wrecked.entries()) {
      expect(() => {
        const view = render(<BattleScene log={log} />);
        view.unmount();
      }, `wrecked log ${index}`).not.toThrow();

      const timeline = buildTimeline(log);
      for (let t = 0; t <= timeline.duration + 500; t += 97) {
        expect(() => frameAt(timeline, t), `wrecked log ${index} @${t}ms`).not.toThrow();
      }
    }
  });
});

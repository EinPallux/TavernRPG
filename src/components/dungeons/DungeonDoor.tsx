'use client';

/**
 * One of the three doors in the Undertavern (dungeons spec §4).
 *
 * A door is a *progress plaque* first and a button second. Between two gear upgrades a delver
 * cannot pass the floor in front of them, and if the only thing the room says is "you lost" they
 * have no reason to come back — so the plaque shows ten rungs, how far the best attempt on the
 * current one got, and exactly what is standing on it.
 *
 * Locked states are all different and all named. "The door will not open" is the least useful
 * thing a locked door can say; "Bram has not seen a Rusty Key in weeks — they turn up on the
 * road" is a thing a player can act on.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { DoorView } from '@/state/dungeonActions';
import { FLOORS_PER_DUNGEON } from '@/data/dungeons';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { CoinIcon, KeyIcon, LaurelIcon, LockIcon, StairsDownIcon, TrophyIcon } from '@/components/icons';
import { snappy, standard } from '@/styles/motion';

/** Minutes and seconds, for a cooldown the player is watching tick down. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The ten rungs, filled to the floors cleared, with the current one part-filled. */
function Rungs({ view }: { view: DoorView }) {
  const reduced = useReducedMotion();

  return (
    <div className="flex gap-1" data-testid={`rungs-${view.definition.id}`}>
      {Array.from({ length: FLOORS_PER_DUNGEON }, (_unused, index) => {
        const floor = index + 1;
        const done = floor <= view.progress.floorsCleared;
        const current = floor === view.floor;
        const best = view.progress.bestAttempts[index] ?? 0;
        const boss = floor === 5 || floor === FLOORS_PER_DUNGEON;

        return (
          <div
            key={floor}
            className={`chamfer-sm relative h-7 flex-1 overflow-hidden border ${
              done
                ? 'border-amber-500/60 bg-amber-500/25'
                : current
                  ? 'border-ember-600/60 bg-wood-900/80'
                  : 'border-parchment-500/12 bg-wood-900/50'
            }`}
            title={`Floor ${floor}${boss ? ' — boss' : ''}`}
          >
            {/*
              The best attempt, as a filled share of the rung. This is the only progress a loss
              leaves behind, so it is drawn on the rung itself rather than in a tooltip.
            */}
            {!done && best > 0 && (
              <motion.span
                aria-hidden
                className="bg-ember-600/35 absolute inset-y-0 left-0"
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${Math.round(best * 100)}%` }}
                transition={standard}
              />
            )}
            <span
              className={`font-display absolute inset-0 grid place-items-center text-[0.65rem] font-bold tabular-nums ${
                done
                  ? 'text-amber-300'
                  : current
                    ? 'text-ember-400'
                    : 'text-parchment-500/72'
              }`}
            >
              {boss ? '★' : floor}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface DungeonDoorProps {
  /**
   * Everything the door draws, recomputed by the screen once a second while anything is cooling
   * down — which is what makes the countdown move without this component owning a timer.
   */
  readonly view: DoorView;
  readonly onDescend: () => void;
}

export function DungeonDoor({ view, onDescend }: DungeonDoorProps) {
  const { definition, refusal, progress } = view;
  const best = view.floor === null ? 0 : (progress.bestAttempts[view.floor - 1] ?? 0);

  return (
    <TavernPanel
      title={definition.name}
      headerSlot={
        view.cleared ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
            <TrophyIcon size={13} />
            Cleared
          </span>
        ) : (
          <span className="text-parchment-500/72 text-xs tabular-nums">
            {progress.floorsCleared}/{FLOORS_PER_DUNGEON}
          </span>
        )
      }
      data-testid={`door-${definition.id}`}
    >
      <p className="text-parchment-500/72 -mt-1 text-xs italic">{definition.tagline}</p>

      <div className="mt-3">
        <Rungs view={view} />
      </div>

      {view.cleared ? (
        <div className="mt-4 flex items-start gap-3">
          <span className="chamfer-sm grid h-10 w-10 shrink-0 place-items-center border border-amber-500/50 bg-amber-500/15 text-amber-400">
            <TrophyIcon size={20} />
          </span>
          <p className="text-parchment-300/85 text-sm leading-relaxed">
            The door is sealed with your crest. <strong>{definition.trophy.name}</strong> hangs on
            your profile.
          </p>
        </div>
      ) : (
        <>
          {/* What is actually standing down there. Named, levelled, and honest about the wall. */}
          <div className="border-parchment-500/10 mt-3 border-t pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-parchment-300 truncate text-sm font-bold">
                {view.isBoss && (
                  <span className="text-ember-400 mr-1.5 text-xs tracking-widest">BOSS</span>
                )}
                {view.floorName}
              </p>
              <span className="text-parchment-500/72 shrink-0 text-xs tabular-nums">
                Floor {view.floor} · L{view.floorLevel}
              </span>
            </div>

            {best > 0 && (
              <p className="text-ember-400/80 mt-1 text-xs tabular-nums">
                Best attempt: {Math.round(best * 100)}% of its health.
              </p>
            )}

            {/*
              Only on a door that opens. The XP figure is capped at the hero's own level, so a
              level-22 delver looking at three shut doors saw the same "74,181 xp" on two of them
              — an honest number that reads as a copy-paste bug. A shut door's job is to explain
              itself, not to quote a price nobody can pay.
            */}
            {view.reward && refusal === null && (
              <p className="text-parchment-500/72 mt-1 flex items-center gap-3 text-xs tabular-nums">
                <span className="flex items-center gap-1">
                  <CoinIcon size={11} />
                  {view.reward.gold.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <LaurelIcon size={11} />
                  {view.reward.xp.toLocaleString()} xp
                </span>
              </p>
            )}
          </div>

          <div className="mt-4">
            {refusal === null ? (
              <ActionButton fullWidth onClick={onDescend} data-testid={`descend-${definition.id}`}>
                <StairsDownIcon size={15} />
                Go down
              </ActionButton>
            ) : (
              <LockedDoor refusal={refusal} keyName={definition.keyName} />
            )}
          </div>
        </>
      )}
    </TavernPanel>
  );
}

/** Each refusal is its own sentence, and each says what to do about it. */
function LockedDoor({
  refusal,
  keyName,
}: {
  refusal: NonNullable<DoorView['refusal']>;
  keyName: string;
}) {
  switch (refusal.kind) {
    case 'below-gate':
      return (
        <Shut icon={<LockIcon size={14} />}>
          The stair does not go down for anyone under level {refusal.gateLevel}. Come back when it
          does.
        </Shut>
      );
    case 'no-key':
      return (
        <Shut icon={<KeyIcon size={14} />} tone="amber">
          Locked. The <strong>{keyName}</strong> turns up out on the roads — keep taking contracts
          and one will find you.
        </Shut>
      );
    case 'cooling-down':
      return (
        <motion.div
          key={Math.ceil(refusal.msRemaining / 1000)}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={snappy}
          className="chamfer-sm border-blood-600/35 bg-blood-600/10 text-parchment-300/80 flex items-center gap-2 border px-3 py-2 text-xs leading-relaxed"
          data-testid="dungeon-cooldown"
        >
          <span className="text-blood-400 font-display shrink-0 font-bold tabular-nums">
            {countdown(refusal.msRemaining)}
          </span>
          The horrors are regrouping. They will be ready before you are.
        </motion.div>
      );
    case 'already-cleared':
    case 'no-hero':
      return <Shut icon={<LockIcon size={14} />}>Nothing left down there.</Shut>;
  }
}

function Shut({
  icon,
  tone = 'plain',
  children,
}: {
  icon: React.ReactNode;
  tone?: 'plain' | 'amber';
  children: React.ReactNode;
}) {
  return (
    <p
      className={`chamfer-sm flex items-start gap-2 border px-3 py-2 text-xs leading-relaxed ${
        tone === 'amber'
          ? 'border-amber-500/30 bg-amber-500/8 text-parchment-300/80'
          : 'border-parchment-500/15 bg-wood-900/60 text-parchment-500/72'
      }`}
      data-testid="dungeon-locked"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

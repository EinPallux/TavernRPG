'use client';

/**
 * Settings (Phase 17 — sound, motion, playback; Phase 18 — the save).
 *
 * The room existed as a dressed placeholder for sixteen phases because nothing in it was real
 * yet. Phase 17 made the SFX mix, the music drop-in and the motion preference real; Phase 18
 * added the panel that matters most and reads least — export and import. Only the glossary index
 * is still outstanding, and the strip at the foot says so.
 *
 * Everything here writes to `shellStore.settings`, which the shell mirrors into the save *and*
 * into the audio singletons. Nothing on this screen touches a volume or an `AudioContext`
 * directly: one door, so a toggle and a slider cannot end up disagreeing about the state of the
 * world.
 *
 * **The music rows only exist when there is music.** No `bgm.mp3` means no toggle, no slider and
 * no explanation of why they are greyed out — a control for a file the player has not supplied is
 * a control that can only disappoint them (asset-pipeline §6, Q13).
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { PLACES_BY_ID } from '@/data/places';
import { SFX_IDS } from '@/data/sfx';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { SavePanel } from './SavePanel';
import { useShellStore } from '@/state/shellStore';
import { useGameStore } from '@/state/gameStore';
import { audioAvailable, play } from '@/state/sfx';
import { bgmAvailable } from '@/state/bgm';
import { activeBeat } from '@/engine/tutorial/beats';
import { listItemIn, snappy, staggerChildren } from '@/styles/motion';

const PLACE = PLACES_BY_ID.settings;

/** A labelled row. Every setting on this screen is one of these, so they all read the same. */
function Row({
  label,
  hint,
  children,
  testId,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <motion.div
      variants={listItemIn}
      className="border-parchment-500/10 flex items-start justify-between gap-6 border-b py-3.5 last:border-b-0"
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <div className="min-w-0">
        <p className="text-parchment-300 text-sm">{label}</p>
        <p className="text-parchment-500/72 mt-0.5 text-xs leading-snug">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </motion.div>
  );
}

/** A two-state switch. Chamfered, like everything else — no pills (style guide §3). */
function Toggle({
  on,
  onChange,
  testId,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  testId: string;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      whileHover={{ y: -1 }}
      whileTap={{ y: 1 }}
      transition={snappy}
      onClick={() => {
        play('select');
        onChange(!on);
      }}
      className={`chamfer-sm font-display border px-3 py-1.5 text-xs tracking-[0.15em] uppercase transition-colors ${
        on
          ? 'text-ink-900 border-amber-400 bg-amber-500 font-bold'
          : 'border-parchment-500/25 text-parchment-500/72 hover:border-amber-500/50'
      }`}
      data-testid={testId}
    >
      {on ? 'On' : 'Off'}
    </motion.button>
  );
}

/** One of three. Used for the motion preference and the battle speed. */
function Choice<T extends string | number>({
  options,
  value,
  onChange,
  testId,
  label,
}: {
  options: readonly { readonly value: T; readonly label: string }[];
  value: T;
  onChange: (next: T) => void;
  testId: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            play('select');
            onChange(option.value);
          }}
          className={`chamfer-sm font-display border px-2.5 py-1.5 text-xs transition-colors ${
            option.value === value
              ? 'text-ink-900 border-amber-400 bg-amber-500 font-bold'
              : 'border-parchment-500/25 text-parchment-500/72 hover:border-amber-500/50'
          }`}
          data-testid={`${testId}-${option.value}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen() {
  const settings = useShellStore((state) => state.settings);
  const setSettings = useShellStore((state) => state.setSettings);
  const save = useGameStore((state) => state.save);
  const setTutorialOptedOut = useGameStore((state) => state.setTutorialOptedOut);

  /*
   * What this browser can do — both questions asked after mount, never during a render.
   *
   * `audioAvailable()` reads `window`, and a render that branches on `window` is a render the
   * server cannot reproduce: it shipped "this browser will not give the game a speaker" and the
   * client built the mix, so React 19 declared a hydration failure and threw the subtree away.
   * The page still *worked*, which is what makes it worth a comment — it cost a full client
   * re-render of the panel on every load and announced itself only as a minified error number.
   *
   * So the first paint assumes the ordinary case — there is a speaker — and the effect corrects
   * it for the browser that has none. Music stays null-until-known instead, because there the
   * ordinary case is *absence*, and a row that appears a beat after the screen settles is nicer
   * than an explanation that gets yanked away from the one player who did drop a file in.
   */
  const [canPlayAudio, setCanPlayAudio] = useState(true);
  const [hasMusic, setHasMusic] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void bgmAvailable().then((available) => {
      if (!alive) return;
      setCanPlayAudio(audioAvailable());
      setHasMusic(available);
    });
    return () => {
      alive = false;
    };
  }, []);
  const tourRunning = save ? activeBeat(save) !== null : false;
  const optedOut = save?.tutorial.optedOut ?? false;

  return (
    <div className="relative h-full w-full" data-testid="place-settings">
      <AmbientStage
        backdrop={PLACE.backdrop}
        {...(PLACE.tint ? { tint: PLACE.tint } : {})}
        {...(PLACE.effects ? { effects: PLACE.effects } : {})}
      >
        <div className="relative h-full overflow-y-auto px-8 py-6">
          <header className="mb-5">
            <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
              Emberhollow
            </p>
            <h1 className="font-display text-parchment-300 text-4xl font-extrabold">
              {PLACE.name}
            </h1>
          </header>

          <motion.div
            initial="hidden"
            animate="visible"
            transition={staggerChildren()}
            className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-2"
          >
            {/* ── Sound ────────────────────────────────────────────────── */}
            <TavernPanel
              title="Sound"
              headerSlot={
                <span className="text-parchment-500/72 text-xs">
                  {SFX_IDS.length} cues · synthesized
                </span>
              }
            >
              {canPlayAudio ? (
                <>
                  <Row
                    label="Sound effects"
                    hint="Clicks, coins, the forge, and every blow of a fight."
                    testId="row-sfx"
                  >
                    <Toggle
                      on={settings.sfxEnabled}
                      onChange={(sfxEnabled) => setSettings({ sfxEnabled })}
                      testId="toggle-sfx"
                      label="Sound effects"
                    />
                  </Row>

                  <Row label="Volume" hint="Master level for everything the game plays.">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(settings.volume * 100)}
                      onChange={(event) =>
                        setSettings({ volume: Number(event.target.value) / 100 })
                      }
                      // A volume slider you cannot hear while dragging is a volume slider you
                      // drag twice. The cue plays at the level being chosen.
                      onMouseUp={() => play('coin')}
                      onKeyUp={() => play('coin')}
                      className="w-40 accent-amber-500"
                      aria-label="Volume"
                      data-testid="slider-volume"
                    />
                    <span className="text-parchment-500/72 w-9 text-right text-xs tabular-nums">
                      {Math.round(settings.volume * 100)}
                    </span>
                  </Row>

                  {hasMusic === true && (
                    <Row
                      label="Background music"
                      hint="Your bgm.mp3, looped, under the cues. Fades out when the tab loses focus."
                      testId="row-music"
                    >
                      <Toggle
                        on={settings.musicEnabled}
                        onChange={(musicEnabled) => setSettings({ musicEnabled })}
                        testId="toggle-music"
                        label="Background music"
                      />
                    </Row>
                  )}

                  {hasMusic === false && (
                    <p
                      className="text-parchment-500/72 pt-3 text-xs leading-relaxed"
                      data-testid="music-absent"
                    >
                      No background music loaded. Drop an MP3 named{' '}
                      <span className="text-parchment-500/72">bgm.mp3</span> into{' '}
                      <span className="text-parchment-500/72">public/assets/audio/</span> and it
                      will loop here, with its own switch. Remove it and the game is quiet again.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-parchment-500/72 py-4 text-sm" data-testid="audio-unavailable">
                  This browser will not give the game a speaker. Everything else still works.
                </p>
              )}
            </TavernPanel>

            {/* ── Motion ───────────────────────────────────────────────── */}
            <TavernPanel title="Motion">
              <Row
                label="Animation"
                hint="System follows your OS setting. Full keeps the ceremonies whatever it says; reduced drops them."
                testId="row-motion"
              >
                <Choice
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'full', label: 'Full' },
                    { value: 'reduced', label: 'Reduced' },
                  ]}
                  value={settings.motion}
                  onChange={(motion) => setSettings({ motion })}
                  testId="choice-motion"
                  label="Animation"
                />
              </Row>

              <Row label="Nav rail" hint="Collapse the town list to icons only.">
                <Toggle
                  on={!settings.navCollapsed}
                  onChange={(open) => setSettings({ navCollapsed: !open })}
                  testId="toggle-rail"
                  label="Nav rail expanded"
                />
              </Row>
            </TavernPanel>

            {/* ── Battles ──────────────────────────────────────────────── */}
            <TavernPanel title="Battles">
              <Row
                label="Playback speed"
                hint="Remembered between fights. The first fight of a save always plays at ×1."
                testId="row-speed"
              >
                <Choice
                  options={[
                    { value: 1, label: '×1' },
                    { value: 2, label: '×2' },
                    { value: 4, label: '×4' },
                  ]}
                  value={settings.battleSpeed}
                  onChange={(battleSpeed) => setSettings({ battleSpeed })}
                  testId="choice-speed"
                  label="Playback speed"
                />
              </Row>

              <Row
                label="Skip to the result"
                hint="Jump straight to the spoils instead of watching. You can still hit Replay."
              >
                <Toggle
                  on={settings.battleSkipDefault}
                  onChange={(battleSkipDefault) => setSettings({ battleSkipDefault })}
                  testId="toggle-skip"
                  label="Skip battles by default"
                />
              </Row>
            </TavernPanel>

            {/* ── Your save ────────────────────────────────────────────── */}
            <TavernPanel
              title="Your save"
              headerSlot={<span className="text-parchment-500/72 text-xs">this browser only</span>}
            >
              <SavePanel />
            </TavernPanel>

            {/* ── The tour ─────────────────────────────────────────────── */}
            <TavernPanel title="Marla’s tour">
              <Row
                label="Show the tour"
                hint={
                  optedOut
                    ? 'Turning it back on resumes at the first beat you have not done.'
                    : tourRunning
                      ? 'Running now. Switching it off hides the spotlight; nothing else changes.'
                      : 'Finished. Switching it off changes nothing.'
                }
                testId="row-tour"
              >
                <Toggle
                  on={!optedOut}
                  onChange={(on) => setTutorialOptedOut(!on)}
                  testId="toggle-tour"
                  label="Show the tour"
                />
              </Row>

              <Row label="Hear a cue" hint="A quick check that the mix is where you want it.">
                <ActionButton size="sm" variant="secondary" onClick={() => play('level-up')}>
                  Test sound
                </ActionButton>
              </Row>
            </TavernPanel>
          </motion.div>

          {/* Still unfinished, and saying so is the placeholder system's whole job. */}
          <p
            className="text-parchment-500/72 mx-auto mt-6 max-w-5xl text-xs leading-relaxed"
            data-testid="settings-later"
          >
            The full glossary index arrives with {PLACE.buildPhase}. Every term in the game is
            already explained where it appears — hover any underlined word.
          </p>
        </div>
      </AmbientStage>
    </div>
  );
}

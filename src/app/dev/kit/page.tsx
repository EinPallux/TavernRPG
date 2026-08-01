'use client';

/**
 * The component kit harness (`/dev/kit`).
 *
 * Every component in every state on one page, so the design system can be reviewed against
 * the style guide in one sitting rather than hunted across screens. It is also where the
 * shell gets driven through states the game can't produce yet — levels that unlock places,
 * timers that are about to fire, a wallet with money in it.
 *
 * Dev-only by intent; excluded from the nav and from the sitemap.
 */

import { useState } from 'react';
import { TavernPanel } from '@/components/ui/TavernPanel';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTooltip } from '@/components/ui/Tooltip';
import { Meter } from '@/components/ui/Meter';
import { TimerChip } from '@/components/ui/TimerChip';
import { KeeperBark } from '@/components/ui/KeeperBark';
import { Modal } from '@/components/ui/Modal';
import { AmbientStage } from '@/components/ui/AmbientStage';
import { ICONS, Icon, VigorTankard, VENDORED_AUTHORS } from '@/components/icons';
import { ICON_IDS } from '@/data/icons';
import { useShellStore } from '@/state/shellStore';
import { gameNow } from '@/state/clock';

const RARITIES = [
  ['Common', 'text-rarity-common border-rarity-common/40'],
  ['Uncommon', 'text-rarity-uncommon border-rarity-uncommon/40'],
  ['Rare', 'text-rarity-rare border-rarity-rare/40'],
  ['Epic', 'text-rarity-epic border-rarity-epic/40'],
  ['Set', 'text-rarity-set border-rarity-set/40'],
] as const;

/** A chip that exists to be hovered. */
function TipDemo({ label, title, detail }: { label?: string; title?: string; detail?: string }) {
  const tip = useTooltip(label ?? (title ? { title, ...(detail ? { detail } : {}) } : null));
  return (
    <span
      {...tip}
      tabIndex={0}
      className="chamfer-sm bg-wood-800/70 border-parchment-500/20 text-parchment-300/85 border px-3 py-1.5 text-xs"
    >
      {label ?? title}
    </span>
  );
}

/**
 * One icon in the showroom, with its name on a tooltip.
 *
 * A component because the tooltip is a hook and the grid is a `map` — and because the kit should
 * demonstrate the kit: this is a real `useTooltip` call, on the page whose job is to show every
 * component state.
 */
function IconCell({ name }: { name: keyof typeof ICONS | '__tankard' }) {
  const tankard = name === '__tankard';
  const tip = useTooltip(tankard ? 'Vigor tankard (fills)' : name);
  return (
    <span
      {...tip}
      tabIndex={0}
      className={`chamfer-sm bg-wood-800/70 border-parchment-500/15 grid h-11 w-11 place-items-center border ${
        tankard ? 'text-ember-400' : 'text-parchment-300/80'
      }`}
    >
      {tankard ? <VigorTankard size={22} ratio={0.55} /> : <Icon name={name} size={20} />}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-display mb-3 text-sm tracking-[0.28em] text-amber-500 uppercase">
        {title}
      </h2>
      <div className="border-parchment-500/12 border-l-2 pl-4">{children}</div>
    </section>
  );
}

export default function KitPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [barkVisible, setBarkVisible] = useState(true);
  const [meterValue, setMeterValue] = useState(420);
  const preview = useShellStore((state) => state.preview);
  const setPreview = useShellStore((state) => state.setPreview);
  const pushToast = useShellStore((state) => state.pushToast);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <p className="font-display text-xs tracking-[0.35em] text-amber-500 uppercase">
          TavernRPG · Design System
        </p>
        <h1 className="font-display text-parchment-300 text-4xl font-extrabold">Component Kit</h1>
        <p className="text-parchment-500/72 mt-2 max-w-2xl text-sm">
          Every component and state, checked against the style guide: chamfers not radii, no serifs,
          motion on everything that changes, disabled states that explain themselves.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div>
          <Section title="Shell controls (drive the frame)">
            <TavernPanel title="Preview state" animate={false}>
              <div className="space-y-4 text-sm">
                <label className="block">
                  <span className="text-parchment-500/72 mb-1 block text-xs tracking-widest uppercase">
                    Hero level — {preview.level} (locks/unlocks rail places)
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={preview.level}
                    onChange={(event) => setPreview({ level: Number(event.target.value) })}
                    className="accent-amber-500"
                    data-testid="kit-level"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPreview({
                        gold: preview.gold + 1250,
                        xp: Math.min(preview.xpForNext, preview.xp + 90),
                      })
                    }
                  >
                    Earn gold + XP
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreview({ dice: preview.dice + 1 })}
                  >
                    Earn a die
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreview({ vigor: Math.max(0, preview.vigor - 20) })}
                  >
                    Spend vigor
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPreview({
                        activityEndsAt: gameNow() + 1000 * 95,
                        activityLabel: 'Mission',
                      })
                    }
                  >
                    Start a timer
                  </ActionButton>
                </div>
              </div>
            </TavernPanel>
          </Section>

          <Section title="Panels">
            <div className="space-y-4">
              <TavernPanel title="Raised (default)" animate={false}>
                <p className="text-parchment-500/75 text-sm">
                  Chamfered corners, etched dual-line edge, brass brackets. The header rule is the
                  facet motif that runs through meters and dividers.
                </p>
              </TavernPanel>
              <TavernPanel title="Floating" elevation="floating" animate={false}>
                <p className="text-parchment-500/75 text-sm">Used for modals and hero moments.</p>
              </TavernPanel>
              <TavernPanel title="Parchment" tone="parchment" animate={false}>
                <p className="text-sm">
                  Work surfaces — quest text, letters, ledgers. Dark ink on warm paper.
                </p>
              </TavernPanel>
            </div>
          </Section>

          <Section title="Buttons">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <ActionButton>Primary</ActionButton>
                <ActionButton variant="secondary">Secondary</ActionButton>
                <ActionButton variant="danger">Danger</ActionButton>
                <ActionButton variant="ghost">Ghost</ActionButton>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <ActionButton size="sm">Small</ActionButton>
                <ActionButton size="md">Medium</ActionButton>
                <ActionButton size="lg">Large</ActionButton>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <ActionButton cost={{ gold: 2400 }}>Buy</ActionButton>
                <ActionButton cost={{ dice: 1 }} variant="secondary">
                  Reroll stock
                </ActionButton>
                <ActionButton disabledReason="You need 2,400 gold — you have 900.">
                  Not affordable
                </ActionButton>
              </div>
            </div>
          </Section>

          <Section title="Meters">
            <div className="space-y-4">
              <Meter value={meterValue} max={1000} tone="xp" label="Experience" />
              <Meter value={62} max={100} tone="vigor" label="Vigor" />
              <Meter value={310} max={980} tone="health" label="Health" />
              <Meter value={7} max={10} tone="neutral" label="Guild bounty" />
              <div className="flex gap-2">
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setMeterValue((value) => Math.min(1000, value + 180))}
                >
                  Gain
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setMeterValue((value) => Math.max(0, value - 250))}
                >
                  Lose
                </ActionButton>
              </div>
            </div>
          </Section>
        </div>

        <div>
          <Section title="Feedback">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  size="sm"
                  onClick={() =>
                    pushToast({
                      title: 'Level 12 reached',
                      detail: 'The Stables are open.',
                      tone: 'reward',
                    })
                  }
                >
                  Reward toast
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    pushToast({
                      title: 'Golden Die found',
                      detail: 'From a 20-minute mission.',
                      tone: 'premium',
                    })
                  }
                >
                  Premium toast
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    pushToast({
                      title: 'Rank lost',
                      detail: 'Kargath the Unlucky passed you.',
                      tone: 'danger',
                    })
                  }
                >
                  Danger toast
                </ActionButton>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <TimerChip endsAt={gameNow() + 1000 * 60 * 7 + 4000} label="Mission" />
                <TimerChip endsAt={gameNow() + 1000 * 60 * 60 * 5} label="Patrol" />
                <TimerChip endsAt={gameNow() - 5000} label="Restock" />
              </div>

              <div>
                <KeeperBark
                  keeper="Marla"
                  line={barkVisible ? "You look like a hero who's about to need a drink." : null}
                />
                <ActionButton
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setBarkVisible((visible) => !visible)}
                >
                  Toggle bark
                </ActionButton>
              </div>

              <ActionButton variant="secondary" onClick={() => setModalOpen(true)}>
                Open confirmation
              </ActionButton>
            </div>
          </Section>

          <Section title="Tooltips (hover, or tab to them)">
            <div className="space-y-3">
              <p className="text-parchment-500/72 text-xs leading-relaxed">
                One element for the whole game, above everything, clipped by nothing. Hover opens
                after a beat; keyboard focus opens at once; press, scroll or Escape closes. Move
                between two and the second is instant — a row of chips should not cost a third of a
                second each.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <TipDemo label="Gold" />
                <TipDemo title="Vigor 100/100" detail="Spent on contracts. Refills at midnight." />
                <TipDemo
                  title="Near the edge"
                  detail="Long enough to need clamping, so it stays inside the window rather than hanging off it."
                />
              </div>
              <div className="flex justify-end">
                <TipDemo title="Bottom right" detail="Flips above when there is no room below." />
              </div>
              <ActionButton
                size="sm"
                disabledReason="Not enough gold — 240 short."
                onClick={() => undefined}
              >
                Disabled, with a reason
              </ActionButton>
            </div>
          </Section>

          <Section title="Rarities">
            <div className="flex flex-wrap gap-2">
              {RARITIES.map(([name, classes]) => (
                <span
                  key={name}
                  className={`chamfer-sm bg-wood-900/60 border px-3 py-1.5 text-xs tracking-widest uppercase ${classes}`}
                >
                  {name}
                </span>
              ))}
            </div>
          </Section>

          {/* The count is ids + the Vigor tankard, which is a meter rather than an id. */}
          <Section
            title={`Icons (${ICON_IDS.length + 1} — ${VENDORED_AUTHORS.length} game-icons.net artists, plus the chevron and the tankard)`}
          >
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ICONS) as (keyof typeof ICONS)[]).map((name) => (
                <IconCell key={name} name={name} />
              ))}
              <IconCell name="__tankard" />
            </div>
          </Section>

          <Section title="Ambient stage">
            <div className="chamfer-md h-56 overflow-hidden">
              <AmbientStage
                backdrop="/assets/backgrounds/tavern_background.webp"
                effects={['hearth', 'embers', 'motes']}
              >
                <div className="flex h-full items-end p-4">
                  <p className="text-parchment-300/80 text-xs">
                    Hearth pulse · rising embers · drifting motes
                  </p>
                </div>
              </AmbientStage>
            </div>
          </Section>

          <Section title="Typography">
            <div className="space-y-2">
              <p className="font-display text-parchment-300 text-3xl font-extrabold">
                Alegreya Sans SC — Display
              </p>
              <p className="text-parchment-300 text-base">
                Inter — body copy. Tabular numerals keep counters from jittering: 1,204,880 gold.
              </p>
              <p className="text-parchment-500/72 text-xs tracking-[0.25em] uppercase">
                Label / overline treatment
              </p>
            </div>
          </Section>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title="Scrap a set piece?"
        onClose={() => setModalOpen(false)}
        confirm={{
          label: 'Scrap it',
          variant: 'danger',
          onConfirm: () =>
            pushToast({ title: 'Scrapped', detail: '3 Starmetal, 10 Essence.', tone: 'warning' }),
        }}
      >
        <p>
          Oathsworn Greaves are part of a set you have 3 of 5 pieces of. Scrapping is permanent —
          Torvald will not be able to put it back together.
        </p>
      </Modal>
    </div>
  );
}

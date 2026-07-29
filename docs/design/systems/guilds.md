# System Spec — Guilds (The Guild Hall)

> Join or found a fellowship in a world where the other 1,500 heroes already have opinions about
> it. 1.0 scope: membership, donations → two economic buff tracks, living chat, weekly co-op
> bounty. Guild-vs-guild combat is explicitly post-1.0 (Q4). Numbers: `../balancing-formulas.md` §11.

Backdrop: `guild_background.png`. Unlocks level 10.

## 1. Joining vs founding

- **Browse guilds:** 60 simulated guilds (name, banner, motto, member count /25, guild level,
  buff levels, vibe tag from personality mix: "hardcore", "cozy", "night owls"). Requirements set
  by bot leadership (min level / min honor); apply → decision arrives in 5–90 min (sim tick,
  personality-weighted — acceptance is likelier from guilds where the player's level fits the
  roster's spread). Rejections come with flavor ("The Amber Blades regret… actually Hargrim just
  doesn't like Tuesdays.") and never lock reapplication (24h cooldown per guild).
- **Found a guild:** 500 gold + name (validator vs generator collisions) + banner builder
  (Kenney-palette colors + sigil icon picker). Player becomes Guildmaster; **bots apply over time**
  (rate scales with guild level & player honor: expect first applicants within hours, ~8–12
  members by week 2 `[TUNE]`). Guildmaster tools: accept/decline applicants (with bot "resume":
  level, class, activity pattern), promote officers, kick (bots react in chat), edit motto/requirements.

## 2. The two buff tracks (economic heart)

- **Treasury** → +0.25%/step **gold** from missions & patrol (cap +25%).
- **Drillmaster** → +0.25%/step **XP** from missions (cap +25%).
- Steps cost gold donations (`500·s^1.7` pooled — anyone's gold counts); donation panel shows
  per-member weekly contributions (bots donate per personality budgets; slackers exist and get
  ribbed in chat). Golden Dice donations: 1 die = 400 gold equivalent `[TUNE]` (optional flex).
- Buffs apply while a member (join/leave updates multipliers immediately; founding-day guilds start
  at 0 — joining an established bot guild trades identity for instant buffs: a real choice).

## 3. Guild chat (the illusion engine)

- Bot chatter generated from the template corpus (content plan §5) driven by real sim events:
  members reference *actual* happenings ("Karg hit 60 grats", "who keeps losing us the bounty",
  welcome messages naming the player on join). 6–20 messages/day depending on guild vibe; quiet
  overnight per bot schedules (timezone offsets make some guilds "EU" and some "NA" flavored).
- Player can post: bots respond contextually (greeting→greeting, brag→grats/tease) within
  personality response odds; never uncanny (no LLM at runtime — curated templates only).
- Chat persists 200 messages; system lines (joins, promotions, bounty progress) interleave.

## 4. Weekly Guild Bounty (co-op)

- Posts Monday: shared target drawn from pool ("Members complete 120 missions", "Win 40 arena
  fights", "Scrap 60 items"). Bots contribute per schedules; progress bar shows top contributors.
- Full clear by Sunday → **Bounty Chest** for all members: gold pot + 1 Golden Die + materials +
  guild XP (partial ≥60% → half chest). Player contribution weight makes small guilds viable `[TUNE]`.

## 5. Guild identity & lifecycle

Guild levels (from total donations + bounties) feed the Hall of Fame guild tab. Bot guilds evolve:
recruit, lose members, merge (rare Town Crier drama), requirements drift with their roster. The
player's guild appears in bot chatter and rival taunts ("The Quiet Flame? More like the Snuffed
Candle") — membership is identity, not a menu.

## 6. Data hooks

`GuildDef/GuildState` {id, name, banner, motto, members: (botId|player)[], treasuryStep,
drillmasterStep, chatLog, bountyState, requirements}, `applyToGuild`, `donate`, ladder-honor
aggregation. Chat generation runs inside world-sim ticks (`world-simulation.md` §4).

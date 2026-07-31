/**
 * Mission blurbs (content-plan §4).
 *
 * The job posting, not the fight. A mission card that reads "Kill 1 Sootback Boar" is a chore;
 * "The Alderman's prize sow has not come home, and the woods have gone quiet" is an errand in a
 * place where people live. Same fight either way — the blurb is the entire difference between a
 * to-do list and a world.
 *
 * **Two pools, and the split is the content pass's whole finding.** Twenty-four blurbs are
 * *generic*: they take the monster and the zone as parameters, so one entry covers every pairing
 * and a rewrite improves 240 mission cards at once. Those carry the situations that can happen
 * anywhere — an overdue cart, a bounty on the door, an alderman with a problem.
 *
 * But a generic blurb can never say *marsh*. It cannot mention the tide, or the forge-heat, or
 * the fact that in Silverpine somebody owns the road. So each zone also gets ten of its own,
 * drawn from the shared pool plus its own — which is what makes Fogmoor Marsh read differently
 * from Ember Caves rather than reading like the same errand with a different backdrop.
 *
 * 124 definitions, 340 zone-blurb pairings. The plan asked for 160 zone-specific lines
 * (content-plan §6) on the assumption that there would be no shared pool; the split gets past
 * that number in what the player actually reads while keeping the cross-zone lines editable in
 * one place.
 *
 * Pure data module.
 */

import type { ZoneId } from './zones';

export interface BlurbDef {
  readonly id: string;
  /** `{monster}` and `{zone}` are substituted; nothing else is. */
  readonly text: string;
  /** Blurbs that only make sense for a long trek. */
  readonly minMinutes?: number;
  /**
   * Zones this line belongs to. Absent means the shared pool — it works anywhere.
   *
   * A zone-tagged blurb is allowed to name what is actually there (the tide, the forge-heat, the
   * toll), which is the only way a card can tell you *where* you are before you read the header.
   */
  readonly zones?: readonly ZoneId[];
}

const BLURB_LIST = [
  {
    id: 'quiet-woods',
    text: 'Nobody has come back from {zone} this week. Marla says that is your problem now, and puts a {monster} at the top of the list.',
  },
  {
    id: 'prize-sow',
    text: "The Alderman's prize sow is missing. Tracks lead into {zone}, and they are not sow tracks.",
  },
  {
    id: 'overdue-cart',
    text: 'A supply cart is four days overdue out of {zone}. The driver was reliable. The road is not.',
  },
  {
    id: 'bounty-posted',
    text: 'There is a bounty on a {monster} nailed to the tavern door. Someone has already crossed out two names.',
  },
  {
    id: 'quiet-neighbours',
    text: 'The farms at the edge of {zone} have stopped sending anyone to market. They have not stopped sending smoke.',
  },
  {
    id: 'surveyors-fee',
    text: 'A surveyor wants {zone} walked and mapped. She will pay well and asks no questions about what you clear on the way.',
  },
  {
    id: 'old-debt',
    text: 'Bram is owed money by a man who fled into {zone}. Bram would like the money. He is flexible about the man.',
  },
  {
    id: 'church-request',
    text: 'A quiet request, quietly funded: something in {zone} is to stop, and a {monster} is the reason it started.',
  },
  {
    id: 'missing-child',
    text: "A child from the outskirts is missing a full day. The search party will not enter {zone} after dark. You're not a search party.",
  },
  {
    id: 'wrong-noises',
    text: 'Travellers report the wrong noises coming out of {zone}. Not louder. Wrong.',
  },
  {
    id: 'harvest-guard',
    text: 'The harvest goes out through {zone} tomorrow. Tonight, somebody clears the road.',
  },
  {
    id: 'scholars-errand',
    text: 'A scholar needs a {monster} observed at close range. She has been unclear about how close, and very clear about the fee.',
  },
  {
    id: 'no-questions',
    text: 'The job is written on the back of a receipt: {zone}, before the week is out, no questions. The coin is already counted.',
  },
  {
    id: 'watch-shorthanded',
    text: 'The watch is short three swords and {zone} is on the patrol route. Hildy is asking nicely, which is unlike her.',
  },
  {
    id: 'inheritance',
    text: 'A widow inherited land in {zone} she cannot set foot on. Make it hers.',
  },
  {
    id: 'trapline',
    text: 'Someone has been robbing the traplines out past {zone}. The trapper suspects a neighbour. The tracks suggest a {monster}.',
  },
  {
    id: 'long-haul',
    text: 'Deep into {zone}, past where the paths give up. Long day. Better pay.',
    minMinutes: 15,
  },
  {
    id: 'overnight',
    text: 'Far side of {zone} and back. You will not be home before dark, and everyone involved knows it.',
    minMinutes: 15,
  },
  {
    id: 'expedition',
    text: 'A proper expedition: {zone} end to end, a {monster} confirmed dead, and a witness who will say so in town.',
    minMinutes: 20,
  },
  {
    id: 'caravan-escort',
    text: 'Escort work through {zone}. Slow, dull, and paid by the hour — right up until it is not dull.',
    minMinutes: 20,
  },
  {
    id: 'rumour',
    text: 'A rumour worth chasing: something in {zone} has been leaving offerings. Somebody is answering them.',
  },
  {
    id: 'clean-sweep',
    text: 'Torvald wants the ore road through {zone} clear by market day. He did not say clear of what.',
  },
  {
    id: 'unfinished',
    text: 'Another sellsword took this contract last month and did not file a report. The contract is still open.',
  },
  {
    id: 'personal',
    text: 'Not a posting — Marla leans over and asks. There is a {monster} in {zone}, and she would take it as a favour.',
  },

  // ── whispering-woods ────────────────────────────────────────────────────────────────
  {
    id: 'woods-lantern-line',
    text: 'Somebody has been cutting the lantern line between the farms and the trees. A {monster} is the working theory.',
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-charcoal',
    text: 'The charcoal burners have stopped sending smoke. They always send smoke.',
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-goat-track',
    text: 'A goat track through {zone} has been widened by something that is not a goat.',
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-quiet-birds',
    text: 'The birds went quiet in {zone} on Tuesday and have not started again.',
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-hedge-line',
    text: 'The hedge-line moved. Not grew — moved. Marla suggests a {monster} and a firm hand.',
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-forester-note',
    text: "A forester's note, half-legible: *do not follow the second path*. It does not say why.",
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-bell-rope',
    text: "Someone cut the bell rope at the woodward's hut before they ran. The bell is still up there.",
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-mushroom-ring',
    text: 'A ring of mushrooms has come up overnight, and a {monster} is sitting in the middle of it.',
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-broken-snares',
    text: 'Every snare on the north line has been sprung and emptied. Politely, almost.',
    zones: ['whispering-woods'],
  },
  {
    id: 'woods-wrong-tree',
    text: 'There is a tree in {zone} that was not there last spring. The Alderman would like a second opinion.',
    zones: ['whispering-woods'],
  },

  // ── millers-fields ────────────────────────────────────────────────────────────────
  {
    id: 'fields-scarecrow',
    text: 'The scarecrow in the west field is facing the house now. Nobody turned it.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-granary',
    text: 'Something is in the granary and the miller will not go in. He is not usually a coward.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-toll-of-grain',
    text: 'A {monster} has been taking a tithe of the harvest, and the harvest cannot spare one.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-mill-wheel',
    text: 'The mill wheel turned all night with the sluice shut. That should not be possible.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-crop-circle',
    text: 'Forty paces of wheat flattened in a shape the miller refuses to describe.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-dog-gone',
    text: 'The farm dogs went out barking two nights ago. They have not come back barking.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-stone-marker',
    text: 'A boundary stone in {zone} has been dug up and moved eight feet. Twice.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-cider-shed',
    text: 'The cider shed has been broken into and nothing was taken but the apples.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-plough-team',
    text: 'The plough team will not cross the bottom acre and the ploughman has stopped arguing.',
    zones: ['millers-fields'],
  },
  {
    id: 'fields-sacks-count',
    text: 'Sacks keep going missing from the {zone} store, one a night, always the same size.',
    zones: ['millers-fields'],
  },

  // ── old-kings-road ────────────────────────────────────────────────────────────────
  {
    id: 'road-toll-collector',
    text: 'Something keeps blowing out the lanterns on {zone}. Find out what — before the toll collector does.',
    zones: ['old-kings-road'],
  },
  {
    id: 'road-milestone',
    text: 'A milestone on {zone} has been carved over with a number that does not belong to any road.',
    zones: ['old-kings-road'],
  },
  {
    id: 'road-coach-late',
    text: "The evening coach is three days late and the coachman's hat came back without him.",
    zones: ['old-kings-road'],
  },
  {
    id: 'road-watchtower',
    text: 'The old watchtower lit a fire last night. It has had no garrison for sixty years.',
    zones: ['old-kings-road'],
  },
  {
    id: 'road-grave-verge',
    text: 'Graves along the verge have been opened from the inside. A {monster} is the kinder explanation.',
    zones: ['old-kings-road'],
  },
  {
    id: 'road-highwayman',
    text: 'A highwayman has stopped robbing travellers and started warning them. That is worse.',
    zones: ['old-kings-road'],
  },
  {
    id: 'road-horse-shy',
    text: 'Every horse on the {zone} refuses the same forty yards of it, and the drivers have started walking.',
    zones: ['old-kings-road'],
  },
  {
    id: 'road-broken-axle',
    text: "A cart lies broken across {zone} with the load untouched and the driver's boots facing the wrong way.",
    zones: ['old-kings-road'],
  },
  {
    id: 'road-bell-post',
    text: 'The bell post at the crossroads rings on still nights. Somebody should look.',
    zones: ['old-kings-road'],
  },
  {
    id: 'road-tollhouse-ledger',
    text: 'The tollhouse ledger has entries in a second hand, for carts nobody saw pass.',
    zones: ['old-kings-road'],
  },

  // ── fogmoor-marsh ────────────────────────────────────────────────────────────────
  {
    id: 'marsh-punt',
    text: 'A punt came back down the channel empty, poled from the far end by nothing at all.',
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-lights',
    text: 'Lights over {zone} again. The reed-cutters have started sleeping in the village.',
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-eel-traps',
    text: 'Every eel trap in {zone} came up full of stones, arranged.',
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-widow-toll',
    text: "The marsh widow's toll has gone up. Nobody agreed to a toll in the first place.",
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-path-moves',
    text: 'The dry path through {zone} was where it always is, until it was not.',
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-bog-body',
    text: 'The peat gave something back this week and it has been walking since.',
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-frog-silence',
    text: 'The frogs in {zone} have stopped. A {monster} is somewhere in all that quiet.',
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-witch-errand',
    text: "A witch's servant has been buying salt in the village. A great deal of salt.",
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-drowned-marker',
    text: 'The channel markers have been re-set to lead somewhere there is no somewhere.',
    zones: ['fogmoor-marsh'],
  },
  {
    id: 'marsh-reed-cutter',
    text: 'The reed-cutters want an escort and will not say for how far.',
    zones: ['fogmoor-marsh'],
  },

  // ── thornhill-ruins ────────────────────────────────────────────────────────────────
  {
    id: 'ruins-chanting',
    text: "Chanting from {zone} again, in a language the Alderman's clerk says has no speakers left.",
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-armour-walks',
    text: 'A suit of armour from the Thornhill hall has left the hall. It did not have anyone in it.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-gargoyle-count',
    text: 'There were eleven gargoyles on the east wall on Monday. There are nine.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-cult-marks',
    text: 'Fresh chalk marks on the ruin gates, and a {monster} has been seen standing inside them.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-dug-floor',
    text: 'Somebody has been digging up the chapel floor at {zone}, carefully, and putting it back.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-stone-warm',
    text: 'The stones at {zone} are warm at midnight, which stone does not do.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-lost-surveyor',
    text: 'The Alderman sent a surveyor to {zone}. The Alderman would like the surveyor back.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-bell-tower',
    text: 'The tower bell rang thirteen times and the tower has no bell.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-locked-door',
    text: 'A door in {zone} that has been shut for a century is open, and something used it.',
    zones: ['thornhill-ruins'],
  },
  {
    id: 'ruins-brass-plate',
    text: 'A brass plate pried off a tomb turned up in a Emberhollow market stall. The seller has gone quiet.',
    zones: ['thornhill-ruins'],
  },

  // ── silverpine-pass ────────────────────────────────────────────────────────────────
  {
    id: 'pass-toll-raised',
    text: 'The clans have raised the toll on {zone} again, and this time they are collecting it in advance.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-cairn-moved',
    text: 'A cairn on {zone} has been rebuilt facing downhill. That is a message.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-supply-train',
    text: 'The winter supply train is overdue and the snow has not even started.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-harpy-nest',
    text: 'Something is nesting above the switchbacks and dropping what it does not want.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-shepherd-gone',
    text: 'A shepherd went up with forty head and came down with none of them, including himself.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-rope-cut',
    text: 'The fixed ropes on the high traverse were cut from above. A {monster} does not use knives.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-wolf-song',
    text: 'The ice wolves in {zone} have started singing in the afternoon, which they do not do.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-avalanche-warn',
    text: 'Three avalanches in a week, all on the same slope, all with clear weather.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-clan-parley',
    text: 'A clan wants to parley and has named a place halfway up {zone}. Bring a sword to the parley.',
    zones: ['silverpine-pass'],
  },
  {
    id: 'pass-summit-fire',
    text: 'There is a fire burning at the top of the pass and nobody in the valley lit it.',
    zones: ['silverpine-pass'],
  },

  // ── ember-caves ────────────────────────────────────────────────────────────────
  {
    id: 'caves-forge-heat',
    text: 'The heat in {zone} has come up two weeks early and the kobolds are moving out.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-glow-vein',
    text: 'A new vein is glowing in {zone} and the first crew to find it has not come back up.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-drum-deep',
    text: 'Drumming from the lower galleries. Torvald says the pattern is a count.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-slag-river',
    text: 'The slag river changed course overnight, which means something moved the channel.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-ore-cart',
    text: 'An ore cart came up on its own, loaded, with a {monster} riding it.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-collapsed-shaft',
    text: 'The old shaft in {zone} collapsed inward, and the rubble is on the wrong side.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-lamp-oil',
    text: 'Every lamp in the {zone} works burned out at once. All of them. At once.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-salamander-eggs',
    text: 'A salamander clutch in the warm gallery, and somebody has been *tending* it.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-hot-water',
    text: 'The spring at the cave mouth is boiling now. It was cold on Tuesday.',
    zones: ['ember-caves'],
  },
  {
    id: 'caves-foreman-terms',
    text: 'The kobold foreman would like to renegotiate. He has brought friends to help him negotiate.',
    zones: ['ember-caves'],
  },

  // ── gloomhollow ────────────────────────────────────────────────────────────────
  {
    id: 'hollow-no-shadow',
    text: 'The hollow has stopped casting shadows at noon. Nobody can explain that and everybody has tried.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-webs-road',
    text: 'Web across the {zone} road, thick enough to hold a cart, and something is under the cart.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-sleep-sickness',
    text: 'Three villagers near {zone} will not wake up. A night hag is the working theory.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-candle-thief',
    text: 'Candles keep going missing from the {zone} shrine. Only the flames, one witness insists.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-child-voice',
    text: "A child's voice calling from inside {zone}. There is no child missing from anywhere.",
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-tree-faces',
    text: 'Faces in the bark along the {zone} path, and one of them is new this week.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-lantern-eaten',
    text: 'The last two lantern-bearers came back without their lanterns and without much else.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-shade-count',
    text: 'A {monster} was seen at the treeline four times in one hour, in four places.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-quiet-dogs',
    text: 'Dogs will not bark inside {zone}. They open their mouths and nothing comes out.',
    zones: ['gloomhollow'],
  },
  {
    id: 'hollow-brood-tithe',
    text: 'Something in the hollow has started taking one animal a night, in order, down the lane.',
    zones: ['gloomhollow'],
  },

  // ── sunken-chapel ────────────────────────────────────────────────────────────────
  {
    id: 'chapel-low-tide',
    text: 'Low tide has uncovered the {zone} door for the first time in a decade. Something used it going in.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-bell-underwater',
    text: 'The drowned bell has been ringing at slack water. It has no rope.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-divers-return',
    text: 'The salvage divers came back up, all of them, all at once, none of them talking.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-reliquary',
    text: "A reliquary from {zone} surfaced in a fisherman's net and has been humming since.",
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-cult-boat',
    text: 'A boat with no oars has been landing at {zone} on the new moon.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-choir-heard',
    text: 'A choir heard from the water off {zone}, in daylight, by nine separate people.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-salt-stain',
    text: 'Salt stains climbing the inside of the chapel wall, three feet above the tide line.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-deep-cult',
    text: 'The deep cult have posted their own notice in Emberhollow. It is an invitation.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-guardian-wakes',
    text: 'A {monster} has taken the chancel and will not let the salvagers past.',
    zones: ['sunken-chapel'],
  },
  {
    id: 'chapel-fish-wrong',
    text: 'The catch off {zone} has come in wrong for a month. Nobody will eat it.',
    zones: ['sunken-chapel'],
  },

  // ── frostfell-ridge ────────────────────────────────────────────────────────────────
  {
    id: 'ridge-white-season',
    text: 'The white season came a month early to {zone} and something came with it.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-giant-track',
    text: 'A track across the {zone} snowfield, one stride to every four of yours.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-roc-shadow',
    text: "A shadow went over the shepherd's hut at noon and did not have wings you would call ordinary.",
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-wraith-camp',
    text: 'A survey camp on {zone} answered the signal fire, then stopped answering anything.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-frozen-song',
    text: 'Singing carried down off {zone} on the wind, and the wind was going the other way.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-cache-robbed',
    text: 'The high caches have been opened and emptied of everything but the rope.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-old-road',
    text: 'The old ridge road is clear of snow for two miles. Nobody cleared it.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-bone-cairn',
    text: 'Someone has built a cairn on {zone} out of something that is not stone.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-thaw-body',
    text: 'The thaw gave up a climber from forty years ago, and a {monster} was standing over him.',
    zones: ['frostfell-ridge'],
  },
  {
    id: 'ridge-last-post',
    text: 'The last waystation on {zone} has stopped sending word. It has never stopped sending word.',
    zones: ['frostfell-ridge'],
  },
] as const satisfies readonly BlurbDef[];

/** Widened for consumers; the literal above is what gets typo-checked. */
export const MISSION_BLURBS: readonly BlurbDef[] = BLURB_LIST;

export const BLURBS_BY_ID: Readonly<Record<string, BlurbDef>> = Object.fromEntries(
  MISSION_BLURBS.map((blurb) => [blurb.id, blurb]),
);

export function blurb(id: string): BlurbDef | undefined {
  return BLURBS_BY_ID[id];
}

/** Blurbs that suit a mission of this length. Never empty. */
export function blurbsForDuration(minutes: number): readonly BlurbDef[] {
  const eligible = MISSION_BLURBS.filter((blurb) => minutes >= (blurb.minMinutes ?? 0));
  return eligible.length > 0 ? eligible : MISSION_BLURBS;
}

/**
 * What a card in this zone can say: the shared pool plus the zone's own.
 *
 * Never empty — the shared twenty-four are always eligible — so a new zone can ship with no
 * lines of its own and still draw a sensible card on the day it opens.
 */
export function blurbsForZone(zoneId: string, minutes: number): readonly BlurbDef[] {
  return blurbsForDuration(minutes).filter(
    (blurb) => blurb.zones === undefined || blurb.zones.includes(zoneId as ZoneId),
  );
}

/** Fill in the placeholders. Unknown placeholders are left alone rather than blanked. */
export function renderBlurb(template: string, values: { monster: string; zone: string }): string {
  return template.replace(/\{(monster|zone)\}/g, (_match, key: 'monster' | 'zone') => values[key]);
}

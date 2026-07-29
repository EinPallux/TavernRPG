'use client';

import { CharacterScreen } from '@/components/hero/CharacterScreen';
import { useGameStore } from '@/state/gameStore';

export default function Page() {
  const hero = useGameStore((state) => state.save?.hero ?? null);

  // The shell shows the creation flow whenever there is no hero, so this only renders in the
  // brief moment before the save has loaded.
  if (!hero) return null;

  return <CharacterScreen hero={hero} />;
}

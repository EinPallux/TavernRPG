import { TavernScreen } from '@/components/tavern/TavernScreen';

/**
 * The tavern stopped being a dressed placeholder in Phase 5 — it is the core loop now, so it
 * renders its own screen rather than `PlaceScreen`.
 */
export default function Page() {
  return <TavernScreen />;
}

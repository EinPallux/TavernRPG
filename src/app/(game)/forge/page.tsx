import { GatedPlace } from '@/components/shell/GatedPlace';
import { ForgeScreen } from '@/components/forge/ForgeScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Torvald's bench: melt, gamble, chase a set. Opened in Phase 12. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.forge}>
      <ForgeScreen />
    </GatedPlace>
  );
}

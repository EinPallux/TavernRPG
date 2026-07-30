import { GatedPlace } from '@/components/shell/GatedPlace';
import { StableScreen } from '@/components/stables/StableScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Odo's four stalls, opened in Phase 7. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.stables}>
      <StableScreen />
    </GatedPlace>
  );
}

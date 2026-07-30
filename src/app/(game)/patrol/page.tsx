import { GatedPlace } from '@/components/shell/GatedPlace';
import { PatrolScreen } from '@/components/patrol/PatrolScreen';
import { PLACES_BY_ID } from '@/data/places';

/**
 * The City Watch became a real screen in Phase 6, so it renders itself rather than the dressed
 * `PlaceScreen` placeholder — behind the gate, because it pays real gold and the nav rail
 * refusing to link here is not the same as the room refusing to open.
 */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.patrol}>
      <PatrolScreen />
    </GatedPlace>
  );
}

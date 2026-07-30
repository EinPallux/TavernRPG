import { ArenaScreen } from '@/components/arena/ArenaScreen';
import { GatedPlace } from '@/components/shell/GatedPlace';
import { PLACES_BY_ID } from '@/data/places';

/** Hildy's sand, opened in Phase 9. The player joins the ladder they have been watching. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.arena}>
      <ArenaScreen />
    </GatedPlace>
  );
}

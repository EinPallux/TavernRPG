import { GatedPlace } from '@/components/shell/GatedPlace';
import { HallOfFame } from '@/components/world/HallOfFame';
import { PLACES_BY_ID } from '@/data/places';

/** Every hero in Aldenvale, ranked. Opened in Phase 9 alongside the Proving Grounds. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.hall}>
      <HallOfFame />
    </GatedPlace>
  );
}

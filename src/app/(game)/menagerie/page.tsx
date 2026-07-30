import { GatedPlace } from '@/components/shell/GatedPlace';
import { MenagerieScreen } from '@/components/pets/MenagerieScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Twelve stalls, one companion at your side. Opened in Phase 14. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.menagerie}>
      <MenagerieScreen />
    </GatedPlace>
  );
}

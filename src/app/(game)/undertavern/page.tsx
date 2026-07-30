import { GatedPlace } from '@/components/shell/GatedPlace';
import { UndertavernScreen } from '@/components/dungeons/UndertavernScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Three doors and thirty floors. Opened in Phase 11. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.undertavern}>
      <UndertavernScreen />
    </GatedPlace>
  );
}

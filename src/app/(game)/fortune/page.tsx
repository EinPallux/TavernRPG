import { GatedPlace } from '@/components/shell/GatedPlace';
import { FortuneScreen } from '@/components/gacha/FortuneScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Vesna's table: three banners, published odds, a visible floor. Opened in Phase 13. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.fortune}>
      <FortuneScreen />
    </GatedPlace>
  );
}

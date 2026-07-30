import { GatedPlace } from '@/components/shell/GatedPlace';
import { ShopScreen } from '@/components/shops/ShopScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Sela's counter, opened in Phase 7. Same screen as the Armory, different shelf and keeper. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.facet}>
      <ShopScreen shopId="facet" />
    </GatedPlace>
  );
}

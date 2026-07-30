import { GatedPlace } from '@/components/shell/GatedPlace';
import { ShopScreen } from '@/components/shops/ShopScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Bram's shop, opened in Phase 7. One shop component serves both keepers. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.armory}>
      <ShopScreen shopId="armory" />
    </GatedPlace>
  );
}

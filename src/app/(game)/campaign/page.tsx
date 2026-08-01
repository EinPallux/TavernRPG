import { GatedPlace } from '@/components/shell/GatedPlace';
import { CampaignScreen } from '@/components/campaign/CampaignScreen';
import { PLACES_BY_ID } from '@/data/places';

/** A hundred and twenty stages out of the gate. Get as far as you can. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.campaign}>
      <CampaignScreen />
    </GatedPlace>
  );
}

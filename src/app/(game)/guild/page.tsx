import { GatedPlace } from '@/components/shell/GatedPlace';
import { GuildHallScreen } from '@/components/guild/GuildHallScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Sixty halls, or one of your own. Opened in Phase 10. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.guild}>
      <GuildHallScreen />
    </GatedPlace>
  );
}

import { PlaceScreen } from '@/components/shell/PlaceScreen';
import { PLACES_BY_ID } from '@/data/places';

export default function Page() {
  return <PlaceScreen place={PLACES_BY_ID.stables} />;
}

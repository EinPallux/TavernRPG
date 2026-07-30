import { GatedPlace } from '@/components/shell/GatedPlace';
import { BoardScreen } from '@/components/board/BoardScreen';
import { PLACES_BY_ID } from '@/data/places';

/** Three notices, two chests and a ledger. Opened in Phase 15. */
export default function Page() {
  return (
    <GatedPlace place={PLACES_BY_ID.board}>
      <BoardScreen />
    </GatedPlace>
  );
}

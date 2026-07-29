import { redirect } from 'next/navigation';

/** The game opens where the game happens: at the tavern. */
export default function RootPage() {
  redirect('/tavern');
}

import { redirect } from 'next/navigation';

/**
 * The game opens outside, in the town square.
 *
 * It used to open at the tavern, which was the right answer while the nav rail was the only way to
 * get anywhere. Now that Emberhollow is a place you can look at, "not in a building" has a screen
 * of its own, and that is what the root is.
 */
export default function RootPage() {
  redirect('/map');
}

import { AppShell } from '@/components/shell/AppShell';

/**
 * Every place in the town renders inside the persistent shell: the rail and HUD survive
 * navigation, only the stage swaps (docs/tech/ui-ux-style-guide.md §2).
 */
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

import type { Metadata } from 'next';
import PlayerByIdClient from './PlayerByIdClient';

// Static export can't prebuild every player id (the highest-cardinality entity),
// so generateStaticParams emits one sentinel shell (player/_). Flask serves it for
// any /player/<id> and injects the real per-player <title>/OG at request time
// (_player_share_page).
export function generateStaticParams() {
  return [{ id: '_' }];
}

export const metadata: Metadata = {
  title: 'لاعب | Youth Scores',
};

export default function Page() {
  return <PlayerByIdClient />;
}

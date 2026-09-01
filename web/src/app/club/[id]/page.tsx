import type { Metadata } from 'next';
import ClubByIdClient from './ClubByIdClient';

// Static export can't prebuild every club id, so generateStaticParams emits one
// sentinel shell (club/_). Flask serves it for any /club/<id> and injects the
// real per-club <title>/OG from live DB data at request time (_club_share_page).
export function generateStaticParams() {
  return [{ id: '_' }];
}

export const metadata: Metadata = {
  title: 'نادٍ | Youth Scores',
};

export default function Page() {
  return <ClubByIdClient />;
}

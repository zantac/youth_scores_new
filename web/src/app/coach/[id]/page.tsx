import type { Metadata } from 'next';
import CoachByIdClient from './CoachByIdClient';

// Static export can't prebuild every coach id, so generateStaticParams emits one
// sentinel shell (coach/_). Flask serves it for any /coach/<id> and injects the
// real per-coach <title>/OG at request time (_coach_share_page).
export function generateStaticParams() {
  return [{ id: '_' }];
}

export const metadata: Metadata = {
  title: 'مدرب | Youth Scores',
};

export default function Page() {
  return <CoachByIdClient />;
}

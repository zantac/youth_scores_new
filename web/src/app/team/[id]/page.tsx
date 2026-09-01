import type { Metadata } from 'next';
import TeamByIdClient from './TeamByIdClient';

// Static export can't prebuild every team id, so generateStaticParams emits one
// sentinel shell (team/_). Flask serves it for any /team/<id> and injects the real
// per-team <title>/OG at request time (_team_share_page).
export function generateStaticParams() {
  return [{ id: '_' }];
}

export const metadata: Metadata = {
  title: 'فريق | Youth Scores',
};

export default function Page() {
  return <TeamByIdClient />;
}

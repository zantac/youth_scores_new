import type { Metadata } from 'next';
import CompetitionByIdClient from './CompetitionByIdClient';

// Static export can't prebuild every competition id, so generateStaticParams emits
// one sentinel shell (competition/_). Flask serves it for any /competition/<id> and
// injects the real per-competition <title>/OG at request time
// (_competition_share_page), including the open-team/tab variants from ?team=/?tab=.
export function generateStaticParams() {
  return [{ id: '_' }];
}

export const metadata: Metadata = {
  title: 'بطولة | Youth Scores',
};

export default function Page() {
  return <CompetitionByIdClient />;
}

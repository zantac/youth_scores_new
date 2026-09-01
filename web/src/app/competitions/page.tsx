import type { Metadata } from 'next';
import CompetitionsClient from './CompetitionsClient';

export const metadata: Metadata = {
  title: 'البطولات | Youth Scores',
  description: 'جميع بطولات كرة القدم للناشئين في مصر: النتائج والترتيب والمجموعات والإحصائيات على Youth Scores.',
};

export default function Page() {
  return <CompetitionsClient />;
}

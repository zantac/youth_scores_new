import type { Metadata } from 'next';
import ClubsClient from './ClubsClient';

export const metadata: Metadata = {
  title: 'الأندية | Youth Scores',
  description: 'استعرض أندية وأكاديميات كرة القدم للناشئين في مصر وتابع فرقها ونتائجها على Youth Scores.',
};

export default function Page() {
  return <ClubsClient />;
}

import type { Metadata } from 'next';
import VenuesClient from './VenuesClient';

export const metadata: Metadata = {
  title: 'الملاعب | Youth Scores',
  description: 'دليل ملاعب مباريات بطولات الناشئين في مصر ومواقعها على الخريطة عبر Youth Scores.',
};

export default function Page() {
  return <VenuesClient />;
}

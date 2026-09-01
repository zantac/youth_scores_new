import type { Metadata } from 'next';
import NewsClient from './NewsClient';

export const metadata: Metadata = {
  title: 'الأخبار | Youth Scores',
  description: 'آخر أخبار كرة قدم الناشئين في مصر وتغطية البطولات والمستجدات على Youth Scores.',
};

export default function Page() {
  return <NewsClient />;
}

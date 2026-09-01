import type { Metadata } from 'next';
import AboutClient from './AboutClient';

export const metadata: Metadata = {
  title: 'من نحن | Youth Scores',
  description: 'تعرّف على Youth Scores، المنصة المستقلة لمتابعة وتوثيق نتائج بطولات كرة القدم للناشئين في مصر من تحت 13 حتى تحت 21 سنة.',
};

export default function Page() {
  return <AboutClient />;
}

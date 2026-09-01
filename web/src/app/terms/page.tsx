import type { Metadata } from 'next';
import TermsClient from './TermsClient';

export const metadata: Metadata = {
  title: 'الشروط والأحكام | Youth Scores',
  description: 'الشروط والأحكام الخاصة باستخدام موقع وتطبيق Youth Scores لمتابعة بطولات كرة القدم للناشئين في مصر.',
};

export default function Page() {
  return <TermsClient />;
}

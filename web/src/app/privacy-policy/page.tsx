import type { Metadata } from 'next';
import PrivacyClient from './PrivacyClient';

export const metadata: Metadata = {
  title: 'سياسة الخصوصية | Youth Scores',
  description: 'سياسة خصوصية Youth Scores: ما المعلومات التي نجمعها، وكيف نستخدمها ونحمي بياناتك عند استخدام الموقع والتطبيق.',
};

export default function Page() {
  return <PrivacyClient />;
}

import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'اتصل بنا | Youth Scores',
  description: 'تواصل مع Youth Scores لإرسال نتائج المباريات أو الاستفسارات والاقتراحات عبر واتساب والبريد الإلكتروني.',
};

export default function Page() {
  return <ContactClient />;
}

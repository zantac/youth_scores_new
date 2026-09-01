'use client';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';

const sectionsAr = [
  {
    title: '1. مقدمة',
    body: 'نحن في Youth Scores نلتزم بحماية خصوصيتك. تشرح هذه السياسة كيفية جمع معلوماتك الشخصية واستخدامها وحمايتها عند استخدام موقعنا.',
  },
  {
    title: '2. المعلومات التي نجمعها',
    items: [
      'طوعياً: عناوين البريد الإلكتروني وأرقام الهواتف والرسائل التي تشاركها معنا',
      'تلقائياً: عناوين IP ونوع المتصفح والصفحات المزارة والتوقيت',
    ],
  },
  {
    title: '3. ملفات تعريف الارتباط (Cookies)',
    items: [
      'ضرورية: لضمان عمل الموقع بشكل صحيح',
      'تحليلية: لقياس أداء الموقع وتحسينه',
      'إعلانية: لعرض إعلانات مخصصة',
    ],
  },
  {
    title: '4. إعلانات Google AdSense',
    body: 'يستخدم Google ملفات تعريف الارتباط لعرض إعلانات مخصصة. يمكنك تعديل تفضيلاتك عبر إعدادات Google للإعلانات أو رابط Digital Advertising Alliance.',
  },
  {
    title: '5. أغراض الاستخدام',
    items: [
      'تحسين المحتوى والخدمات',
      'الرد على الاستفسارات',
      'تحليل استخدام الموقع',
      'عرض إعلانات مخصصة',
      'الكشف عن الاحتيال وحماية الأمان',
    ],
  },
  {
    title: '6. مشاركة البيانات مع الأطراف الثالثة',
    body: 'لا نبيع بياناتك الشخصية لأي طرف. قد نشارك البيانات مع مزودي الخدمة ضمن الحدود القانونية اللازمة فقط.',
  },
  {
    title: '7. أمان البيانات',
    body: 'نطبق تدابير أمنية معقولة لحماية بياناتك. مع ذلك، لا يمكن ضمان أمان نقل البيانات عبر الإنترنت بنسبة 100%.',
  },
  {
    title: '8. خصوصية الأطفال',
    body: 'لا نجمع عن قصد بيانات شخصية من مستخدمين أقل من 13 عاماً. إذا اكتشفنا ذلك، سنحذف البيانات فوراً.',
  },
  {
    title: '9. حقوق المستخدم',
    items: [
      'الوصول إلى بياناتك الشخصية',
      'تصحيح أو حذف بياناتك',
      'الاعتراض على معالجة بياناتك',
      'إلغاء الاشتراك في الاتصالات التسويقية',
    ],
  },
  {
    title: '10. الروابط الخارجية',
    body: 'قد يحتوي موقعنا على روابط لمواقع خارجية. لسنا مسؤولين عن سياسات الخصوصية الخاصة بتلك المواقع.',
  },
  {
    title: '11. تحديثات السياسة',
    body: 'قد نحدّث هذه السياسة بشكل دوري. سيتم نشر التغييرات مع تحديث التاريخ في أعلى الصفحة.',
  },
  {
    title: '12. التواصل',
    body: 'للاستفسار عن سياسة الخصوصية، تواصل معنا عبر: zyadwael2009@gmail.com أو واتساب: 01064428821',
  },
];

const sectionsEn = [
  {
    title: '1. Introduction',
    body: 'At Youth Scores, we are committed to protecting your privacy. This policy explains how we collect, use, and protect your personal information when using our website.',
  },
  {
    title: '2. Information We Collect',
    items: [
      'Voluntarily: email addresses, phone numbers, and messages you share with us',
      'Automatically: IP addresses, browser type, visited pages, and timestamps',
    ],
  },
  {
    title: '3. Cookies',
    items: [
      'Necessary: to ensure the website works correctly',
      'Analytics: to measure and improve website performance',
      'Advertising: to display personalized ads',
    ],
  },
  {
    title: '4. Google AdSense',
    body: 'Google uses cookies to show personalized ads. You can adjust your preferences via Google Ads Settings or the Digital Advertising Alliance.',
  },
  {
    title: '5. How We Use Your Information',
    items: [
      'Improving content and services',
      'Responding to inquiries',
      'Analyzing website usage',
      'Showing personalized ads',
      'Fraud detection and security',
    ],
  },
  {
    title: '6. Third-Party Data Sharing',
    body: 'We do not sell your personal data. We may share data with service providers only within the necessary legal limits.',
  },
  {
    title: '7. Data Security',
    body: 'We implement reasonable security measures to protect your data. However, 100% security of Internet data transmission cannot be guaranteed.',
  },
  {
    title: "8. Children's Privacy",
    body: 'We do not intentionally collect personal data from users under 13. If discovered, we will delete the data immediately.',
  },
  {
    title: '9. Your Rights',
    items: [
      'Access your personal data',
      'Correct or delete your data',
      'Object to data processing',
      'Unsubscribe from marketing communications',
    ],
  },
  {
    title: '10. External Links',
    body: 'Our website may contain links to external sites. We are not responsible for the privacy policies of those sites.',
  },
  {
    title: '11. Policy Updates',
    body: 'We may update this policy periodically. Changes will be published with an updated date at the top of the page.',
  },
  {
    title: '12. Contact',
    body: 'For questions about this privacy policy, contact us at: zyadwael2009@gmail.com or WhatsApp: 01064428821',
  },
];

export default function PrivacyPage() {
  const { locale } = useApp();
  const isAr = locale === 'ar';
  const sections = isAr ? sectionsAr : sectionsEn;

  return (
    <>
      <AppBar title={isAr ? 'سياسة الخصوصية' : 'Privacy Policy'} back />

      <div className="p-4 space-y-3 max-w-lg mx-auto pb-8">
        <div className="text-center py-3">
          <div className="text-5xl mb-2">🔒</div>
          <h1 className="text-aqua font-bold text-xl">{isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}</h1>
          <p className="text-hint text-xs mt-1">{isAr ? 'آخر تحديث: 21 ديسمبر 2025' : 'Last updated: December 21, 2025'}</p>
        </div>

        {sections.map((sec, i) => (
          <div key={i} className="bg-cardBg border border-bdr rounded-xl p-4">
            <h2 className="text-aqua font-bold text-sm mb-2">{sec.title}</h2>
            {'body' in sec && sec.body && (
              <p className="text-teal text-sm leading-[1.8]">{sec.body}</p>
            )}
            {'items' in sec && sec.items && (
              <ul className="space-y-1.5">
                {sec.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-teal text-sm">
                    <span className="text-aqua flex-shrink-0 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <div className="flex justify-center gap-4 text-xs text-hint pt-2">
          <a href="/about" className="hover:text-aqua">{isAr ? 'من نحن' : 'About'}</a>
          <span>·</span>
          <a href="/terms" className="hover:text-aqua">{isAr ? 'الشروط والأحكام' : 'Terms'}</a>
          <span>·</span>
          <a href="/contact" className="hover:text-aqua">{isAr ? 'اتصل بنا' : 'Contact'}</a>
        </div>
      </div>
    </>
  );
}

'use client';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';

const sectionsAr = [
  {
    title: '1. وصف الخدمة',
    body: 'يقدم Youth Scores معلومات عن بطولات كرة القدم للناشئين في مصر، تشمل نتائج المباريات، والترتيب، وإحصائيات اللاعبين، وأخبار رياضية. باستخدامك للموقع، فأنت توافق على هذه الشروط.',
  },
  {
    title: '2. إخلاء المسؤولية عن البيانات',
    body: 'البيانات المنشورة على Youthscores ليست بيانات رسمية من الاتحاد المصري لكرة القدم أو أي جهة رسمية. يتم جمعها عن طريق المتابعة الشخصية للمباريات، ورسائل أولياء الأمور واللاعبين، وصفحات الأندية على وسائل التواصل الاجتماعي.',
  },
  {
    title: '3. الاستخدام المحظور',
    items: [
      'نسخ أو إعادة نشر محتوى الموقع بشكل جماعي دون إذن مسبق',
      'استخدام بوتات أو أدوات آلية للوصول إلى الموقع',
      'نشر معلومات كاذبة أو مضللة',
      'محاولة الوصول غير المصرح به إلى أنظمة الموقع',
    ],
  },
  {
    title: '4. المحتوى الذي يشاركه المستخدمون',
    body: 'عند إرسال أي معلومات أو نتائج، فأنت تضمن أن لديك الحق في مشاركتها وتمنح Youth Scores إذناً لاستخدامها ونشرها على المنصة.',
  },
  {
    title: '5. حماية القاصرين',
    body: 'ينشر الموقع معلومات عامة عن الناشئين. نتجنب نشر البيانات الشخصية الحساسة للأطفال. يحق لأولياء الأمور طلب إزالة أي معلومات تخص أبنائهم.',
  },
  {
    title: '6. حدود المسؤولية',
    body: 'يقدم Youth Scores خدماته "كما هي" دون أي ضمانات تتعلق بدقة البيانات أو استمرارية الخدمة. لا نتحمل مسؤولية أي أضرار ناجمة عن الاعتماد على المعلومات المنشورة.',
  },
  {
    title: '7. الملكية الفكرية',
    body: 'جميع المحتويات الأصلية على الموقع (التصميم، الشعار، النصوص) هي ملك لـ Youth Scores. لا يجوز استخدامها دون إذن خطي مسبق.',
  },
  {
    title: '8. القانون المطبق',
    body: 'تخضع هذه الشروط لقوانين جمهورية مصر العربية. أي نزاعات تندرج ضمن اختصاص المحاكم المصرية.',
  },
  {
    title: '9. التواصل',
    body: 'للاستفسار عن هذه الشروط: zyadwael2009@gmail.com أو واتساب: +201064428821',
  },
];

const sectionsEn = [
  {
    title: '1. Service Description',
    body: 'Youth Scores provides information about youth football tournaments in Egypt, including match results, standings, player statistics, and sports news. By using the website, you agree to these terms.',
  },
  {
    title: '2. Data Disclaimer',
    body: 'Data published on Youth Scores is not official data from the Egyptian Football Association or any official body. It is collected through personal match monitoring, messages from parents and players, and club social media pages.',
  },
  {
    title: '3. Prohibited Activities',
    items: [
      'Copying or republishing website content collectively without prior permission',
      'Using bots or automated tools to access the website',
      'Publishing false or misleading information',
      'Attempting unauthorized access to website systems',
    ],
  },
  {
    title: '4. User-Submitted Content',
    body: 'When submitting any information or results, you guarantee that you have the right to share it and grant Youth Scores permission to use and publish it on the platform.',
  },
  {
    title: '5. Minor Protection',
    body: 'The website publishes general information about youth players. We avoid publishing sensitive personal data about children. Parents have the right to request removal of any information about their children.',
  },
  {
    title: '6. Limitation of Liability',
    body: 'Youth Scores provides its services "as-is" without any guarantees regarding data accuracy or service continuity. We are not responsible for any damages resulting from reliance on published information.',
  },
  {
    title: '7. Intellectual Property',
    body: 'All original content on the website (design, logo, text) belongs to Youth Scores. It may not be used without prior written permission.',
  },
  {
    title: '8. Governing Law',
    body: 'These terms are governed by the laws of the Arab Republic of Egypt. Any disputes fall under the jurisdiction of Egyptian courts.',
  },
  {
    title: '9. Contact',
    body: 'For inquiries about these terms: zyadwael2009@gmail.com or WhatsApp: +201064428821',
  },
];

export default function TermsPage() {
  const { locale } = useApp();
  const isAr = locale === 'ar';
  const sections = isAr ? sectionsAr : sectionsEn;

  return (
    <>
      <AppBar title={isAr ? 'الشروط والأحكام' : 'Terms & Conditions'} back />

      <div className="p-4 space-y-3 max-w-lg mx-auto pb-8">
        <div className="text-center py-3">
          <div className="text-5xl mb-2">📋</div>
          <h1 className="text-aqua font-bold text-xl">{isAr ? 'الشروط والأحكام' : 'Terms & Conditions'}</h1>
          <p className="text-hint text-xs mt-1">{isAr ? 'يرجى قراءة هذه الشروط بعناية قبل استخدام الموقع' : 'Please read these terms carefully before using the website'}</p>
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
          <a href="/about"          className="hover:text-aqua">{isAr ? 'من نحن' : 'About'}</a>
          <span>·</span>
          <a href="/privacy-policy" className="hover:text-aqua">{isAr ? 'الخصوصية' : 'Privacy'}</a>
          <span>·</span>
          <a href="/contact"        className="hover:text-aqua">{isAr ? 'اتصل بنا' : 'Contact'}</a>
        </div>
      </div>
    </>
  );
}

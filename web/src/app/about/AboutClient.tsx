'use client';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';

const sections = {
  ar: [
    {
      emoji: '🏆',
      title: 'من نحن',
      body: 'Youth Scores هو موقع إلكتروني مخصص لمتابعة وتوثيق نتائج بطولات كرة القدم للناشئين في مصر. نغطي جميع المراحل السنية من تحت 13 سنة حتى تحت 21 سنة، ونوفر نتائج المباريات والترتيب والإحصائيات بشكل مستمر.',
    },
    {
      emoji: '📖',
      title: 'قصتنا',
      body: 'نشأت المنصة استجابةً لحاجة حقيقية؛ كان أولياء الأمور والمهتمون بكرة قدم الناشئين يجدون صعوبة في الحصول على نتائج المباريات ومعلومات البطولات في مكان واحد. جمعنا كل هذا في منصة واحدة سهلة الاستخدام.',
    },
    {
      emoji: '⚽',
      title: 'خدماتنا',
      items: [
        'نتائج المباريات فور انتهائها',
        'جداول الترتيب والمجموعات',
        'إحصائيات شاملة (أهداف، تمريرات حاسمة، بطاقات)',
        'معلومات الفرق والملاعب',
        'أخبار كرة قدم الناشئين',
      ],
    },
    {
      emoji: '📊',
      title: 'مصادر البيانات',
      body: 'نجمع المعلومات عن طريق المتابعة الشخصية للمباريات، ورسائل أولياء الأمور واللاعبين، وصفحات الأندية الرسمية على وسائل التواصل الاجتماعي، ومراسلين متطوعين. هذه البيانات ليست بيانات رسمية من الاتحاد المصري لكرة القدم.',
    },
    {
      emoji: '👥',
      title: 'جمهورنا',
      body: 'نخدم أولياء أمور اللاعبين الراغبين في متابعة أداء أبنائهم، واللاعبين الشباب، والمدربين، والأندية، وجميع المهتمين بتطوير كرة القدم في مصر.',
    },
    {
      emoji: '⚠️',
      title: 'إخلاء المسؤولية',
      body: 'Youth Scores هو موقع غير رسمي ومستقل، ولا ينتمي إلى الاتحاد المصري لكرة القدم أو أي جهة رسمية أخرى. جميع البيانات المنشورة هي لأغراض إعلامية فقط.',
    },
  ],
  en: [
    {
      emoji: '🏆',
      title: 'About Us',
      body: 'Youth Scores is a website dedicated to tracking and documenting youth football tournament results in Egypt. We cover all age groups from under-13 to under-21, providing match results, standings, and statistics continuously.',
    },
    {
      emoji: '📖',
      title: 'Our Story',
      body: 'The platform was born from a real need — parents and football enthusiasts struggled to find match results and tournament information in one place. We brought everything together into one easy-to-use platform.',
    },
    {
      emoji: '⚽',
      title: 'Our Services',
      items: [
        'Match results as soon as they finish',
        'Standings tables and group tables',
        'Comprehensive statistics (goals, assists, cards)',
        'Team and venue information',
        'Youth football news',
      ],
    },
    {
      emoji: '📊',
      title: 'Data Sources',
      body: 'We collect information through personal match monitoring, messages from parents and players, official club social media pages, and volunteer reporters. This data is not official data from the Egyptian Football Association.',
    },
    {
      emoji: '👥',
      title: 'Our Audience',
      body: "We serve parents who want to follow their children's performance, young players, coaches, clubs, and all those interested in football development in Egypt.",
    },
    {
      emoji: '⚠️',
      title: 'Disclaimer',
      body: 'Youth Scores is an unofficial, independent website and is not affiliated with the Egyptian Football Association or any other official body. All published data is for informational purposes only.',
    },
  ],
};

export default function AboutPage() {
  const { locale } = useApp();
  const isAr = locale === 'ar';
  const content = isAr ? sections.ar : sections.en;

  return (
    <>
      <AppBar title={isAr ? 'من نحن' : 'About'} back />

      <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
        {/* Hero */}
        <div className="text-center py-4">
          <div className="text-6xl mb-3">⚽</div>
          <h1 className="text-aqua font-bold text-2xl">Youth Scores</h1>
          <p className="text-teal text-sm mt-1">بطولات الناشئين | youthscores.org</p>
        </div>

        {/* Sections */}
        {content.map((sec, i) => (
          <div key={i} className="bg-cardBg border border-bdr rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{sec.emoji}</span>
              <h2 className="text-aqua font-bold text-base">{sec.title}</h2>
            </div>
            {'body' in sec && sec.body && (
              <p className="text-teal text-sm leading-[1.9]">{sec.body}</p>
            )}
            {'items' in sec && sec.items && (
              <ul className="space-y-2">
                {sec.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-teal text-sm">
                    <span className="text-aqua mt-0.5 flex-shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Contact CTA */}
        <div className="bg-aqua/5 border border-aqua/20 rounded-2xl p-4 text-center space-y-3">
          <p className="text-teal text-sm">
            {isAr ? 'هل لديك نتيجة مباراة أو استفسار؟' : 'Have a match result or inquiry?'}
          </p>
          <a href="/contact" className="inline-block bg-aqua text-on-accent font-bold text-sm px-6 py-2.5 rounded-xl">
            {isAr ? 'تواصل معنا' : 'Contact Us'}
          </a>
        </div>

        {/* Footer links */}
        <div className="flex justify-center gap-4 text-xs text-hint pt-2">
          <a href="/privacy-policy" className="hover:text-aqua">{isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}</a>
          <span>·</span>
          <a href="/terms" className="hover:text-aqua">{isAr ? 'الشروط والأحكام' : 'Terms'}</a>
        </div>
      </div>
    </>
  );
}

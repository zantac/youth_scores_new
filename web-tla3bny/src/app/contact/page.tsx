'use client';
import { useTT } from '@/components/tla3bny/kit';

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.waellotfy.youthscores&pcampaignid=web_share';

export default function ContactPage() {
  const tt = useTT();

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Intro */}
      <div className="text-center pt-2">
        <div className="text-5xl mb-3">📬</div>
        <h1 className="text-xl font-black text-text mb-2">{tt('اتصل بنا', 'Contact Us')}</h1>
        <p className="text-teal text-sm leading-relaxed">
          {tt(
            'نرحب بجميع استفساراتكم ومقترحاتكم. يمكنكم التواصل معنا عبر الوسائل التالية:',
            'We welcome all your inquiries and suggestions. You can reach us through the following channels:',
          )}
        </p>
      </div>

      {/* WhatsApp */}
      <a href="https://wa.me/+201064428821" target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-4 bg-cardBg border border-[#25D366]/40 rounded-2xl p-5 active:opacity-80 transition-opacity">
        <div className="w-14 h-14 rounded-full bg-[#25D366]/15 flex items-center justify-center flex-shrink-0">
          <span className="text-3xl">💬</span>
        </div>
        <div className="flex-1">
          <p className="text-text font-bold text-base mb-0.5">
            {tt('التواصل والاستفسارات', 'Contact & Inquiries')}
          </p>
          <p className="text-teal text-sm">
            {tt('تسجيل الأكاديميات، البطولات، أو أي معلومات عبر واتساب', 'Academy registration, tournaments, or any info via WhatsApp')}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 bg-[#25D366] text-white text-sm font-bold px-4 py-2 rounded-xl">
            <span>💬</span>
            <span>{tt('واتساب', 'WhatsApp')}</span>
          </div>
        </div>
      </a>

      {/* Email — Technical */}
      <a href="mailto:zyadwael2009@gmail.com"
        className="flex items-center gap-4 bg-cardBg border border-[#EA4335]/40 rounded-2xl p-5 active:opacity-80 transition-opacity">
        <div className="w-14 h-14 rounded-full bg-[#EA4335]/10 flex items-center justify-center flex-shrink-0">
          <span className="text-3xl">📧</span>
        </div>
        <div className="flex-1">
          <p className="text-text font-bold text-base mb-0.5">
            {tt('الاستفسارات البرمجية', 'Technical Inquiries')}
          </p>
          <p className="text-teal text-sm">
            {tt('للاستفسارات التقنية والاقتراحات البرمجية', 'For technical questions and development suggestions')}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 bg-[#EA4335] text-white text-sm font-bold px-4 py-2 rounded-xl">
            <span>📧</span>
            <span>{tt('البريد الإلكتروني', 'Email')}</span>
          </div>
        </div>
      </a>

      {/* Encouragement note */}
      <div className="bg-aqua/5 border border-aqua/20 rounded-xl p-4 text-center">
        <p className="text-teal text-sm leading-relaxed">
          {tt(
            '💡 مقترحاتكم وملاحظاتكم تساعدنا على تطوير المنصة وتحسين تجربتكم',
            '💡 Your suggestions and feedback help us improve the platform and your experience',
          )}
        </p>
      </div>

      {/* App download — one app covers both Youth Scores and Tla3bny */}
      <section className="bg-cardBg border border-bdr rounded-2xl p-5 text-center space-y-3">
        <p className="text-text font-bold text-sm">
          {tt('📱 حمّل التطبيق على أندرويد', '📱 Download the Android App')}
        </p>
        <p className="text-teal text-xs">
          {tt(
            'تطبيق واحد يجمع يوث سكورز وتلاعبني — بطولات، ترتيب، إحصائيات، وتشكيلات',
            'One app for both Youth Scores and Tla3bny — tournaments, standings, stats, and lineups',
          )}
        </p>
        <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-darkBg border border-aqua/30 text-text text-sm font-bold px-5 py-3 rounded-xl">
          <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" className="text-aqua">
            <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256-255.4L47 0zm425.6 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c17-9.8 17-33.9-.9-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
          </svg>
          Google Play
        </a>
        <p className="text-hint text-[10px]">{tt('أو أضف الموقع لشاشتك الرئيسية على آيفون 📲', 'Or add to Home Screen on iPhone 📲')}</p>
      </section>

      <p className="text-center text-bdr text-[10px]">© 2025 Tla3bny · تلاعبني</p>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import MatchesFeed from '@/components/home/MatchesFeed';
import NewsDetail from '@/components/news/NewsDetail';
import { getCompName, formatNewsDate, isRecent, localize, groupKey, buildCompTitle } from '@/lib/utils';
import type { NewsItem } from '@/lib/types';

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.waellotfy.youthscores&pcampaignid=web_share';

// ── Competition picker modal ──────────────────────────────────────────────────

function CompPicker({ onClose, locale }: { onClose: () => void; locale: string }) {
  const { config } = useApp();
  const router = useRouter();
  const [openSeason, setOpenSeason] = useState<string | null>(null);
  const [openComp,   setOpenComp]   = useState<string | null>(null);
  const isAr = locale === 'ar';

  const go = (url: string, title: { ar: string; en: string }) => {
    onClose();
    // The data URL embeds the competition id (…/competitions/<id>/data) — open
    // by that compact id; fall back to the legacy url+title form if it's absent.
    const m = url.match(/\/competitions\/(\d+)\/data/);
    const p = m
      ? new URLSearchParams({ id: m[1] })
      : new URLSearchParams({ url, title: title.ar || title.en, titleAr: title.ar, titleEn: title.en });
    router.push(`/competition?${p.toString()}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-cardBg rounded-t-3xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cardBg flex items-center justify-between px-5 py-4 border-b border-bdr">
          <h2 className="text-aqua font-bold text-base">{isAr ? 'اختر البطولة' : 'Select Competition'}</h2>
          <button onClick={onClose} className="text-hint text-xl font-bold">✕</button>
        </div>
        <div className="p-3 space-y-2 pb-8">
          {(config?.seasons ?? []).map(season => {
            const seasonKey  = groupKey(season.name);
            const seasonName = localize(season.name, locale);
            return (
            <div key={seasonKey} className="rounded-xl overflow-hidden border border-bdr">
              <button onClick={() => setOpenSeason(s => s === seasonKey ? null : seasonKey)}
                className="w-full flex items-center gap-3 bg-darkBg px-4 py-3.5">
                <span className="text-lg">🏆</span>
                <span className="flex-1 text-aqua font-bold text-sm text-start">{seasonName}</span>
                <span className="text-aqua">{openSeason === seasonKey ? '▲' : '▼'}</span>
              </button>
              {openSeason === seasonKey && (
                <div>
                  {season.competitions.map(comp => {
                    const name = getCompName(comp, locale);
                    const ck = `${seasonKey}:${comp.id}`;
                    return (
                      <div key={comp.id} className="border-t border-bdr">
                        <button onClick={() => setOpenComp(k => k === ck ? null : ck)}
                          className="w-full flex items-center gap-2 px-4 py-3">
                          <span className="text-sm">⚽</span>
                          <span className="flex-1 text-text text-sm text-start">{name}</span>
                          <span className="text-aqua">{openComp === ck ? '▲' : '▼'}</span>
                        </button>
                        {openComp === ck && (
                          <div className="bg-cardBg border-t border-bdr">
                            {comp.ages.map(age => {
                              const ageLabel = localize(age.ageName ?? age.age, locale);
                              if (age.sectors.length > 0) return age.sectors.map(sec => (
                                <button key={sec.url} onClick={() => go(sec.url, buildCompTitle(comp.name, age.ageName ?? age.age, sec.name))}
                                  className="w-full flex items-center gap-2 px-5 py-2.5 border-b border-bdr/30 text-start">
                                  <span className="text-teal text-sm">› {ageLabel} — {localize(sec.name, locale)}</span>
                                </button>
                              ));
                              if (age.directMatchesUrl) return (
                                <button key={age.age} onClick={() => go(age.directMatchesUrl!, buildCompTitle(comp.name, age.ageName ?? age.age, null))}
                                  className="w-full flex items-center gap-3 px-5 py-3 border-b border-bdr/30 text-start">
                                  <span className="text-teal text-sm">› {ageLabel}</span>
                                </button>
                              );
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

// ── News card (mini) ──────────────────────────────────────────────────────────

function MiniNewsCard({ item, locale, onClick }: { item: NewsItem; locale: string; onClick: () => void }) {
  const thumb = item.images?.[0] ?? (item.image?.startsWith('http') ? item.image : null);
  const [recent, setRecent] = useState(false);
  useEffect(() => { setRecent(isRecent(item.date)); }, [item.date]);
  return (
    <button onClick={onClick} className="w-full bg-cardBg border border-bdr rounded-xl overflow-hidden text-start flex gap-3 p-3 active:opacity-75">
      {thumb
        ? <img src={thumb} alt={localize(item.title, locale)} className="w-20 h-16 object-cover rounded-lg flex-shrink-0" />
        : <div className="w-20 h-16 bg-darkBg rounded-lg flex-shrink-0 flex items-center justify-center text-2xl">📰</div>
      }
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div className="flex items-start gap-1">
          <p className="flex-1 text-aqua font-bold text-xs leading-relaxed line-clamp-2">{localize(item.title, locale)}</p>
          {recent && <span className="flex-shrink-0 text-[9px] text-aqua border border-aqua rounded px-1 py-0.5 font-bold">NEW</span>}
        </div>
        <p className="text-hint text-[10px] mt-1">📅 {formatNewsDate(item.date, locale)}</p>
      </div>
    </button>
  );
}

// ── Home page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { config, configLoading, locale } = useApp();
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const isAr = locale === 'ar';

  const latestNews = config?.news.slice(0, 3) ?? [];

  return (
    <div className="min-h-screen bg-darkBg">

      {/* The Competitions/News CTA row was removed — both are always reachable
          from the bottom navigation, so a duplicate top row just added clutter. */}
      <div className="px-4 pt-4 space-y-6 pb-8">

        {/* ── All matches, by date then competition ─────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text font-bold text-base flex items-center gap-2">
              <span>⚽</span>
              {isAr ? 'المباريات' : 'Matches'}
            </h2>
            <Link href="/competitions" className="text-aqua text-xs">
              {isAr ? 'كل البطولات ›' : 'All ›'}
            </Link>
          </div>

          <MatchesFeed locale={locale} />
        </section>

        {/* ── Latest news ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text font-bold text-base flex items-center gap-2">
              <span>📰</span>
              {isAr ? 'آخر الأخبار' : 'Latest News'}
            </h2>
            <Link href="/news" className="text-aqua text-xs">
              {isAr ? 'المزيد ›' : 'More ›'}
            </Link>
          </div>

          {configLoading && !config ? (
            <div className="bg-cardBg border border-bdr rounded-2xl p-6 text-center">
              <div className="w-6 h-6 border-2 border-bdr border-t-aqua rounded-full animate-spin mx-auto mb-2" />
              <p className="text-hint text-sm">{isAr ? 'جاري تحميل الأخبار...' : 'Loading news...'}</p>
            </div>
          ) : latestNews.length > 0 ? (
            <div className="space-y-2">
              {latestNews.map((item, i) => (
                <MiniNewsCard key={i} item={item} locale={locale}
                  onClick={() => setSelectedNews(item)} />
              ))}
              <Link href="/news"
                className="block text-center text-aqua text-sm font-bold py-2 border border-aqua/30 rounded-xl mt-1">
                {isAr ? 'عرض كل الأخبار ›' : 'View all news ›'}
              </Link>
            </div>
          ) : (
            <div className="bg-cardBg border border-bdr rounded-2xl p-5 text-center">
              <p className="text-hint text-sm">{isAr ? 'لا توجد أخبار' : 'No news yet'}</p>
            </div>
          )}
        </section>

        {/* ── Quick links ───────────────────────────────────────────────── */}
        <section>
          <h2 className="text-text font-bold text-base mb-3">
            {isAr ? '🔗 روابط سريعة' : '🔗 Quick Links'}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { emoji: '🏆', arLabel: 'جميع البطولات', enLabel: 'Competitions', href: '/competitions' },
              { emoji: '📰', arLabel: 'آخر الأخبار',   enLabel: 'Latest News',   href: '/news' },
              { emoji: '📍', arLabel: 'مواقع الملاعب', enLabel: 'Venues',         href: '/venues' },
            ].map(link => (
              <Link key={link.arLabel} href={link.href}>
                <div className="bg-cardBg border border-bdr rounded-2xl p-4 flex flex-col items-center gap-2 text-center h-full active:bg-aqua/10 transition-colors">
                  <span className="text-3xl">{link.emoji}</span>
                  <span className="text-teal text-xs font-bold leading-tight">
                    {isAr ? link.arLabel : link.enLabel}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── App download ──────────────────────────────────────────────── */}
        <section className="bg-cardBg border border-bdr rounded-2xl p-5 text-center space-y-3">
          <p className="text-text font-bold text-sm">
            {isAr ? '📱 حمّل التطبيق على أندرويد' : '📱 Download the Android App'}
          </p>
          <p className="text-teal text-xs">
            {isAr ? 'إشعارات فورية، ترتيب الفرق، ومتابعة البطولات' : 'Instant notifications, team standings, and tournament tracking'}
          </p>
          <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-darkBg border border-aqua/30 text-text text-sm font-bold px-5 py-3 rounded-xl">
            <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" className="text-aqua">
              <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256-255.4L47 0zm425.6 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c17-9.8 17-33.9-.9-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </svg>
            Google Play
          </a>
          <p className="text-hint text-[10px]">{isAr ? 'أو أضف الموقع لشاشتك الرئيسية على آيفون 📲' : 'Or add to Home Screen on iPhone 📲'}</p>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer className="space-y-4">
          <div className="bg-cardBg/50 border border-bdr rounded-xl p-4">
            <p className="text-hint text-[11px] leading-relaxed text-center">
              {isAr
                ? 'هذه البيانات ليست بيانات رسمية وتم جمعها من خلال المتابعة الشخصية للمباريات أو من رسائل أولياء الأمور واللاعبين أو من صفحات التواصل الاجتماعي للأندية.'
                : 'This data is not official and was collected through personal match monitoring, messages from parents and players, or club social media pages.'}
            </p>
          </div>

          {/* About / Privacy / Terms / Contact now live in the More tab. */}
          <p className="text-center text-bdr text-[10px]">© 2025 Youth Scores · youthscores.org</p>
        </footer>
      </div>

      {/* Inline news detail — shared reader (photos at the bottom, tap to zoom) */}
      {selectedNews && (
        <NewsDetail item={selectedNews} locale={locale} onClose={() => setSelectedNews(null)} />
      )}
    </div>
  );
}

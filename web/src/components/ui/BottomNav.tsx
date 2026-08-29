'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

const tabs = [
  { href: '/',              icon: '🏠', arLabel: 'الرئيسية', enLabel: 'Home' },
  { href: '/competitions',  icon: '🏆', arLabel: 'البطولات', enLabel: 'Competitions' },
  { href: '/clubs',         icon: '🛡️', arLabel: 'الأندية',  enLabel: 'Clubs' },
  { href: '/news',          icon: '📰', arLabel: 'الأخبار',  enLabel: 'News' },
  { href: '/venues',        icon: '🏟️', arLabel: 'الملاعب',  enLabel: 'Venues' },
  { href: '/more',          icon: '⋯',  arLabel: 'المزيد',   enLabel: 'More' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { locale, newNewsCount, newVenuesCount } = useApp();
  const badgeFor = (href: string) =>
    href === '/news' ? newNewsCount : href === '/venues' ? newVenuesCount : 0;

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-cardBg border-t border-bdr safe-bottom z-50">
      <div className="flex items-stretch max-w-lg mx-auto">
        {tabs.map(tab => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          const label  = locale === 'ar' ? tab.arLabel : tab.enLabel;
          const badge  = badgeFor(tab.href);
          return (
            <Link key={tab.href} href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors relative ${active ? 'text-aqua' : 'text-hint'}`}>
              <span className="relative text-lg">
                {tab.icon}
                {badge > 0 && (
                  <span className="absolute -top-1 -end-2 min-w-[15px] h-[15px] px-1 grid place-items-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none tnum">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className={`text-[9px] leading-tight text-center ${active ? 'font-bold' : ''}`}>{label}</span>
              {active && <div className="absolute bottom-0 h-0.5 w-6 bg-aqua rounded-t" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

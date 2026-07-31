'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

const tabs = [
  { href: '/',             icon: '🏠', arLabel: 'الرئيسية',   enLabel: 'Home' },
  { href: '/competitions', icon: '🏆', arLabel: 'البطولات',   enLabel: 'Competitions' },
  { href: '/academies',    icon: '🏫', arLabel: 'الأكاديميات', enLabel: 'Academies' },
  { href: '/news',         icon: '📰', arLabel: 'الأخبار',    enLabel: 'News' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { locale } = useApp();

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-cardBg border-t border-bdr safe-bottom z-50">
      <div className="flex items-stretch max-w-3xl mx-auto">
        {tabs.map(tab => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          const label = locale === 'ar' ? tab.arLabel : tab.enLabel;
          return (
            <Link key={tab.href} href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors relative ${active ? 'text-aqua' : 'text-hint'}`}>
              <span className="text-lg">{tab.icon}</span>
              <span className={`text-[9px] leading-tight text-center ${active ? 'font-bold' : ''}`}>{label}</span>
              {active && <div className="absolute bottom-0 h-0.5 w-6 bg-aqua rounded-t" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

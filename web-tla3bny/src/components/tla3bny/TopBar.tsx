'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { useTT } from './kit';

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
        active ? 'bg-aqua/15 text-aqua' : 'text-teal hover:text-text'
      }`}
    >
      {label}
    </Link>
  );
}

export default function TopBar() {
  const tt = useTT();
  const { locale, toggleLocale, isDark, toggleTheme } = useApp();
  const { user, isSuperAdmin, isCompetitionAdmin, logout } = useTla3bnyAuth();
  const pathname = usePathname();
  const router = useRouter();

  const is = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));

  const nav = [
    { href: '/', label: tt('الرئيسية', 'Home') },
    { href: '/competitions', label: tt('البطولات', 'Competitions') },
    { href: '/academies', label: tt('الأكاديميات', 'Academies') },
    { href: '/news', label: tt('الأخبار', 'News') },
  ];

  const isStaff = isSuperAdmin || isCompetitionAdmin;
  const accountHref = isStaff ? '/admin' : '/dashboard';
  const accountLabel = isSuperAdmin
    ? tt('الإدارة', 'Admin')
    : isCompetitionAdmin
      ? tt('بطولاتي', 'My Competitions')
      : tt('حسابي', 'My Account');

  return (
    <header className="sticky top-0 z-20 bg-darkBg/90 backdrop-blur border-b border-bdr">
      <div className="max-w-3xl mx-auto px-3">
        <div className="flex items-center gap-2 h-14">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl grid place-items-center font-black text-on-accent bg-gradient-to-br from-aqua to-aqua/70 shadow-[0_8px_20px_-8px_rgb(var(--accent-rgb))]">
              ت
            </div>
            <span className="font-extrabold text-text text-lg hidden sm:block">{tt('تلاعبني', 'Tla3bny')}</span>
          </Link>

          <nav className="flex items-center gap-0.5 overflow-x-auto no-scrollbar mx-1 flex-1">
            {nav.map(n => <NavLink key={n.href} {...n} active={is(n.href)} />)}
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={toggleLocale} title="language"
              className="w-9 h-9 grid place-items-center rounded-lg text-teal hover:text-text text-xs font-bold">
              {locale === 'ar' ? 'EN' : 'ع'}
            </button>
            <button onClick={toggleTheme} title="theme"
              className="w-9 h-9 grid place-items-center rounded-lg text-teal hover:text-text">
              {isDark ? '☀️' : '🌙'}
            </button>
            {user ? (
              <div className="flex items-center gap-1">
                <Link href={accountHref}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold bg-cardBg2 border border-bdr text-text hover:border-aqua transition-colors">
                  {accountLabel}
                </Link>
                <button onClick={() => { logout(); router.push('/'); }}
                  className="w-9 h-9 grid place-items-center rounded-lg text-hint hover:text-loss" title={tt('خروج', 'Logout')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            ) : (
              <Link href="/login"
                className="px-3 py-1.5 rounded-lg text-sm font-extrabold bg-gradient-to-l from-aqua to-aqua/85 text-on-accent shadow-[0_8px_20px_-10px_rgb(var(--accent-rgb))]">
                {tt('دخول', 'Login')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

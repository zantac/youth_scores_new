'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { useTT } from './kit';

export default function TopBar() {
  const tt = useTT();
  const { locale, toggleLocale, isDark, toggleTheme } = useApp();
  const { user, isSuperAdmin, isCompetitionAdmin, logout } = useTla3bnyAuth();
  const router = useRouter();

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
        {/* dir=ltr so lang/theme sit on the physical left and login on the physical right */}
        <div className="flex items-center h-12 gap-2" dir="ltr">
          {/* Left: lang + theme */}
          <div className="flex items-center gap-1">
            <button onClick={toggleLocale} title="language"
              className="text-[10px] text-aqua font-bold border border-aqua/40 rounded-lg px-2 py-1 leading-none bg-cardBg hover:bg-aqua/10 transition-colors">
              {locale === 'ar' ? 'EN' : 'ع'}
            </button>
            <button onClick={toggleTheme} title="theme"
              className="text-sm leading-none bg-cardBg border border-bdr rounded-lg px-2 py-1 hover:bg-aqua/10 transition-colors">
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>

          {/* Center: logo */}
          <Link href="/" className="flex items-center gap-2 mx-auto shrink-0">
            <div className="w-8 h-8 rounded-xl grid place-items-center font-black text-on-accent bg-gradient-to-br from-aqua to-aqua/70 shadow-[0_8px_20px_-8px_rgb(var(--accent-rgb))]">
              ت
            </div>
            <span className="font-extrabold text-text text-base">{tt('تلاعبني', 'Tla3bny')}</span>
          </Link>

          {/* Right: login / account */}
          <div className="flex items-center gap-1">
            {user ? (
              <>
                <Link href={accountHref}
                  className="text-[11px] font-bold border border-aqua/40 rounded-lg px-3 py-1 leading-none bg-cardBg text-aqua hover:bg-aqua/10 transition-colors">
                  {accountLabel}
                </Link>
                <button onClick={() => { logout(); router.push('/'); }}
                  className="w-8 h-8 grid place-items-center rounded-lg text-hint hover:text-loss" title={tt('خروج', 'Logout')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </>
            ) : (
              <Link href="/login"
                className="flex items-center gap-1.5 text-[11px] font-bold text-aqua border border-aqua/40 rounded-lg px-3 py-1 leading-none bg-cardBg hover:bg-aqua/10 transition-colors">
                <span aria-hidden="true">🔑</span>
                {tt('دخول', 'Login')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

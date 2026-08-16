'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import SearchOverlay from './SearchOverlay';
import NotifyBell from './NotifyBell';

export default function ControlsBar() {
  const { locale, isDark, toggleLocale, toggleTheme } = useApp();
  const isAr = locale === 'ar';
  const [searchOpen, setSearchOpen] = useState(false);
  // The pinning + published height now live in StickyHeader, which wraps this
  // row together with the banner so both stay on screen on the home feed.
  const pathname = usePathname();
  // The admin login lives only on the More page now; it used to sit on every
  // page's controls bar, duplicating something that belongs in one place.
  // trailingSlash is on, so the route is "/more/" — tolerate the trailing slash.
  const showLogin = pathname.replace(/\/+$/, '') === '/more';

  // Matches the width the banner and bottom nav are held to, so the controls
  // line up with the rest of the column on a wide screen.
  return (
    <div className="w-full max-w-lg mx-auto flex items-center gap-2 px-3 py-2" dir="ltr">
      <button
        onClick={toggleLocale}
        className="text-[10px] text-aqua font-bold border border-aqua/40 rounded-lg px-2 py-1 leading-none bg-cardBg hover:bg-aqua/10 transition-colors"
      >
        {locale === 'ar' ? 'EN' : 'ع'}
      </button>
      <button
        onClick={toggleTheme}
        className="text-sm leading-none bg-cardBg border border-bdr rounded-lg px-2 py-1 hover:bg-aqua/10 transition-colors"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? '☀️' : '🌙'}
      </button>
      <button
        onClick={() => setSearchOpen(true)}
        className="text-sm leading-none bg-cardBg border border-bdr rounded-lg px-2 py-1 hover:bg-aqua/10 transition-colors"
        aria-label={isAr ? 'بحث' : 'Search'}
      >
        🔍
      </button>
      <NotifyBell />

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

      {/* Login is shown only on the More page; pushed to the far end so it never
          crowds the language and theme toggles. */}
      {showLogin && (
        <Link
          href="/admin/login"
          className="ms-auto flex items-center gap-1.5 text-[11px] font-bold text-aqua border border-aqua/40 rounded-lg px-3 py-1 leading-none bg-cardBg hover:bg-aqua/10 transition-colors"
        >
          <span aria-hidden="true">🔑</span>
          {isAr ? 'دخول' : 'Log in'}
        </Link>
      )}
    </div>
  );
}

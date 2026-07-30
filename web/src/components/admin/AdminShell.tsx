'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { ROLE_LABEL } from '@/lib/adminApi';

function Spinner() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="w-7 h-7 border-2 border-bdr border-t-aqua rounded-full animate-spin" />
    </div>
  );
}

// Matches are not here: they live as a tab inside المسابقات, alongside the
// seasons, clubs and teams they belong to.
const NAV = [
  { href: '/admin',           label: 'لوحة التحكم', icon: '🏠', super: false },
  { href: '/admin/structure', label: 'المسابقات',   icon: '🏆', super: false },
  { href: '/admin/content',   label: 'أخبار وملاعب', icon: '📰', super: false },
  { href: '/admin/players',   label: 'اللاعبون',    icon: '👤', super: false },
  { href: '/admin/users',     label: 'المستخدمون',  icon: '👥', super: true },
];

export default function AdminShell({
  title, requireSuperadmin, children,
}: { title: string; requireSuperadmin?: boolean; children: React.ReactNode }) {
  const { user, loading, logout, isSuperadmin } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();
  const headRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/admin/login');
    else if (requireSuperadmin && !isSuperadmin) router.replace('/admin');
  }, [loading, user, isSuperadmin, requireSuperadmin, router]);

  // Publish the sticky top-bar height so page content (e.g. the المسابقات tab
  // strip) can pin directly beneath it and stay reachable through a long list.
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--admin-head-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--admin-head-h'); };
  }, [loading, user]);

  if (loading || !user || (requireSuperadmin && !isSuperadmin)) return <Spinner />;

  const links = NAV.filter(n => !n.super || isSuperadmin);

  return (
    <div className="min-h-full">
      {/* Top bar */}
      <header ref={headRef} className="sticky top-0 z-20 bg-gradient-to-l from-cardBg to-cardBg2 border-b border-bdr">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg grid place-items-center font-black text-on-accent bg-gradient-to-br from-aqua to-aqua/70">Y</div>
          <div className="flex-1">
            <p className="text-aqua font-extrabold text-sm leading-none">لوحة الإدارة</p>
            <p className="text-hint text-[10px] mt-1">يوث سكورز</p>
          </div>
          <div className="text-end">
            <p className="text-text text-xs font-bold leading-none">{user.full_name || user.username}</p>
            <p className="text-gold text-[10px] mt-1">{ROLE_LABEL[user.role]?.ar ?? user.role}</p>
          </div>
          <button onClick={logout}
            className="text-loss text-xs font-bold border border-loss/40 bg-loss/10 rounded-lg px-3 py-1.5 hover:bg-loss/20 transition-colors">
            خروج
          </button>
        </div>
        {/* Nav */}
        <nav className="max-w-3xl mx-auto flex gap-1 px-2 overflow-x-auto no-scrollbar">
          {links.map(n => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-colors ${active ? 'border-aqua text-aqua' : 'border-transparent text-hint hover:text-teal'}`}>
                <span>{n.icon}</span>{n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-text font-extrabold text-lg mb-4">{title}</h1>
        {children}
      </main>
    </div>
  );
}

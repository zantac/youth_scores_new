'use client';
import { usePathname } from 'next/navigation';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

// The staff sign-in is a bare, centered screen — matching the youthscores admin
// login: no banner, top bar or bottom nav, just the form. Every other route
// gets the full app chrome (banner → top bar → content → bottom nav).
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // trailingSlash is on, so usePathname yields "/login/"; normalise before match.
  const route = pathname.replace(/\/+$/, '') || '/';

  if (route === '/login') return <>{children}</>;

  return (
    <>
      <div className="w-full max-w-3xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/banner.png" alt="تلاعبني" className="w-full h-auto" />
      </div>
      <TopBar />
      <main className="w-full max-w-3xl mx-auto px-3 py-4 pb-24">{children}</main>
      <BottomNav />
    </>
  );
}

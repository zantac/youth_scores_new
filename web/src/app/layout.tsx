import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import BottomNav from '@/components/ui/BottomNav';
import StickyHeader from '@/components/ui/StickyHeader';
import AdOverlay from '@/components/ui/AdOverlay';
import SentryInit from '@/components/SentryInit';

export const metadata: Metadata = {
  title: 'بطولات الناشئين | Youth Scores',
  description: 'متابعة بطولات كرة القدم للناشئين في مصر - نتائج، ترتيب، إحصائيات',
  manifest: '/manifest.json',
  icons: { apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Youth Scores' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#15D8FF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body className="bg-dark font-arabic antialiased" suppressHydrationWarning>
        {/* Apply the visitor's saved language/direction/theme to <html> before
            first paint. The static HTML ships the Arabic/RTL/dark default, so a
            returning English or light-mode user would otherwise see a flash of
            that default until the client effect runs. AppProvider keeps <html>
            in sync afterwards (and skips its own first run so it can't clobber
            what this set). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var e=document.documentElement," +
              "l=localStorage.getItem('locale');" +
              "if(l==='ar'||l==='en'){e.lang=l;" +
              "e.setAttribute('dir',l==='ar'?'rtl':'ltr');}" +
              "var d=localStorage.getItem('isDark');" +
              "if(d!==null){e.classList.toggle('dark',d==='true');}" +
              "}catch(_){}})();",
          }}
        />
        <SentryInit />
        <AppProvider>
          <div className="flex flex-col min-h-dvh">
            {/* Banner + search/theme/language row. Pinned together on the home
                feed so they stay on screen while the matches scroll beneath. */}
            <StickyHeader />
            {/* The bottom nav has always been max-w-lg, so on a wide screen the
                content used to run edge to edge under a phone-width nav. The
                whole column is held to one width instead. */}
            <main className="flex-1 pb-20 w-full max-w-lg mx-auto">{children}</main>
            <BottomNav />
            <AdOverlay />
          </div>
        </AppProvider>
      </body>
    </html>
  );
}

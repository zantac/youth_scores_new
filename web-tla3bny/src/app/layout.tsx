import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import { Tla3bnyAuthProvider } from '@/context/Tla3bnyAuthContext';
import Shell from '@/components/tla3bny/Shell';

export const metadata: Metadata = {
  title: 'تلاعبني | Tla3bny League',
  description: 'إدارة ومتابعة دوري الأكاديميات — نتائج، ترتيب، إحصائيات، وتشكيلات',
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0891B2',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Standalone tla3bny app root. Unlike the version embedded in the youthscores
// web (which layered a fixed overlay over that site's chrome), this owns the
// whole page: its routes are the subdomain root.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body className="font-arabic antialiased min-h-dvh" suppressHydrationWarning>
        <AppProvider>
          <Tla3bnyAuthProvider>
            <Shell>{children}</Shell>
          </Tla3bnyAuthProvider>
        </AppProvider>
      </body>
    </html>
  );
}

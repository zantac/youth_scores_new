'use client';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';

// The "More" hub reached from the bottom bar — mirrors the Android app's More
// screen: Favourites, Contact us, About, Privacy Policy and Terms.
export default function MorePage() {
  const { locale } = useApp();
  const isAr = locale === 'ar';

  return (
    <>
      <AppBar title={isAr ? 'المزيد' : 'More'} />

      <div className="p-4 space-y-3 max-w-lg mx-auto">
        <MoreTile
          href="/more/favourites"
          emoji="⭐"
          title={isAr ? 'المفضلة' : 'Favourites'}
          sub={isAr ? 'البطولات والفرق التي تتابعها' : 'Competitions and teams you follow'}
          isAr={isAr}
        />
        <MoreTile
          href="/contact"
          emoji="💬"
          title={isAr ? 'تواصل معنا' : 'Contact Us'}
          sub={isAr ? 'أرسل النتائج وتواصل معنا' : 'Submit results and reach us'}
          isAr={isAr}
        />
        <MoreTile
          href="/about"
          emoji="ℹ️"
          title={isAr ? 'من نحن' : 'About'}
          sub={isAr ? 'عن يوث سكورز' : 'About Youth Scores'}
          isAr={isAr}
        />
        <MoreTile
          href="/privacy-policy"
          emoji="🔒"
          title={isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
          sub={isAr ? 'كيف نتعامل مع بياناتك' : 'How we handle your data'}
          isAr={isAr}
        />
        <MoreTile
          href="/terms"
          emoji="📄"
          title={isAr ? 'الشروط والأحكام' : 'Terms'}
          sub={isAr ? 'شروط الاستخدام' : 'Terms of use'}
          isAr={isAr}
        />
      </div>
    </>
  );
}

function MoreTile({ href, emoji, title, sub, isAr }: {
  href: string; emoji: string; title: string; sub: string; isAr: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl px-4 py-3.5 transition-all hover:border-aqua/30 active:opacity-80"
    >
      <span className="w-11 h-11 rounded-xl grid place-items-center text-xl bg-aqua/10 border border-aqua/20 flex-shrink-0">
        {emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-text font-bold text-sm">{title}</span>
        <span className="block text-hint text-xs mt-0.5">{sub}</span>
      </span>
      <span className="text-hint text-lg">{isAr ? '‹' : '›'}</span>
    </Link>
  );
}

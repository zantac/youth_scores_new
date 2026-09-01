import Link from 'next/link';

// Friendly 404. With output: 'export' this becomes the site's 404.html, so a bad
// URL lands on the themed shell instead of a bare host default.
export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-text text-lg font-extrabold mb-2">الصفحة غير موجودة</h1>
        <p className="text-hint text-sm mb-6">Page not found</p>
        <Link
          href="/"
          className="inline-block bg-aqua text-on-accent font-bold rounded-xl px-5 py-2.5 text-sm"
        >
          الرئيسية / Home
        </Link>
      </div>
    </div>
  );
}

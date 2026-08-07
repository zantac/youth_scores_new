'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth, SESSION_EXPIRED_KEY } from '@/context/AdminAuthContext';

export default function AdminLoginPage() {
  const { login, user, loading } = useAdminAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => { if (!loading && user) router.replace('/admin'); }, [loading, user, router]);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
      setSessionExpired(true);
      sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تسجيل الدخول');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full grid place-items-center p-5 relative">
      {/* floodlit ambience */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(700px 380px at 30% 0%, rgba(30,224,255,0.10), transparent 60%), radial-gradient(600px 360px at 85% 10%, rgba(255,194,75,0.06), transparent 58%)' }} />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="youthscores"
            className="w-14 h-14 rounded-2xl object-cover shadow-[0_12px_30px_-8px_rgb(var(--accent-rgb))]" />
          <h1 className="text-text font-extrabold text-xl mt-4">لوحة الإدارة</h1>
          <p className="text-hint text-xs mt-1">دخول المسؤولين</p>
        </div>

        <form onSubmit={submit}
          className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-5 space-y-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
          <div>
            <label className="block text-teal text-xs font-bold mb-1.5">اسم المستخدم</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus
              className="w-full bg-darkBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm outline-none focus:border-aqua transition-colors" />
          </div>
          <div>
            <label className="block text-teal text-xs font-bold mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-darkBg border border-bdr rounded-xl px-4 py-2.5 pe-16 text-text text-sm outline-none focus:border-aqua transition-colors" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-teal hover:text-aqua">
                {showPw ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {sessionExpired && (
            <p className="text-gold text-xs bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.</p>
          )}
          {error && (
            <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={busy || !username || !password}
            className="w-full bg-gradient-to-l from-aqua to-aqua/85 text-on-accent font-extrabold py-3 rounded-xl disabled:opacity-50 transition-opacity shadow-[0_10px_24px_-10px_rgb(var(--accent-rgb))]">
            {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}

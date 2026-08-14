'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { Field, inputCls, PrimaryButton, ErrorNote, useTT } from '@/components/tla3bny/kit';

export default function Tla3bnyLoginPage() {
  const tt = useTT();
  const { login, user, loading } = useTla3bnyAuth();
  const router = useRouter();
  // One box for whichever the account has: organisers, academy owners and team
  // managers sign in with a username, older accounts with their email.
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dest = (u: { role: string }) =>
    (u.role === 'super_admin' || u.role === 'competition_admin' ? '/admin' : '/dashboard');

  useEffect(() => { if (!loading && user) router.replace(dest(user)); }, [loading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const u = await login(loginId.trim().toLowerCase(), password);
      // Full navigation (not client-side replace) so iOS Safari sees the
      // successful form submission and offers to save the credentials.
      window.location.href = dest(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : tt('تعذّر تسجيل الدخول', 'Login failed'));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh grid place-items-center p-5 relative">
      {/* floodlit ambience — same as the youthscores admin login */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(700px 380px at 30% 0%, rgba(30,224,255,0.10), transparent 60%), radial-gradient(600px 360px at 85% 10%, rgba(255,194,75,0.06), transparent 58%)' }} />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="تلاعبني" className="w-14 h-14 rounded-2xl shadow-[0_12px_30px_-8px_rgb(var(--accent-rgb))]" />
          <h1 className="text-text font-extrabold text-xl mt-4">{tt('تسجيل الدخول', 'Sign in')}</h1>
          <p className="text-hint text-xs mt-1">{tt('دخول المسئولين', 'Staff sign-in')}</p>
        </div>

        <form onSubmit={submit}
          className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-5 space-y-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
          <Field label={tt('اسم المستخدم أو البريد', 'Username or email')}>
            <input name="username" id="username" type="text"
              value={loginId} autoFocus dir="ltr" autoComplete="username"
              onChange={e => setLoginId(e.target.value)} className={inputCls} />
          </Field>
          <Field label={tt('كلمة المرور', 'Password')}>
            <div className="relative">
              <input name="password" id="password"
                type={showPw ? 'text' : 'password'} value={password} autoComplete="current-password"
                onChange={e => setPassword(e.target.value)} className={`${inputCls} pe-16`} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-teal hover:text-aqua">
                {showPw ? tt('إخفاء', 'Hide') : tt('إظهار', 'Show')}
              </button>
            </div>
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit" disabled={busy || !loginId || !password} className="w-full">
            {busy ? tt('جارٍ الدخول…', 'Signing in…') : tt('دخول', 'Sign in')}
          </PrimaryButton>
        </form>

        <p className="text-center text-sm text-hint mt-4">
          {tt('ليس لديك حساب؟', 'No account?')}{' '}
          <Link href="/register" className="text-aqua font-bold hover:underline">{tt('سجّل أكاديميتك', 'Register')}</Link>
        </p>
      </div>
    </div>
  );
}

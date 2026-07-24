'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { Field, inputCls, PrimaryButton, ErrorNote, useTT } from '@/components/tla3bny/kit';

export default function Tla3bnyRegisterPage() {
  const tt = useTT();
  const { register } = useTla3bnyAuth();
  const router = useRouter();
  const [f, setF] = useState({
    name: '', email: '', password: '', phone: '', address: '',
    facebook_url: '', training_place: '',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await register({ ...f, email: f.email.trim().toLowerCase(), logo });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : tt('تعذّر التسجيل', 'Registration failed'));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full grid place-items-center py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl grid place-items-center font-black text-2xl text-on-accent bg-gradient-to-br from-aqua to-aqua/70 shadow-[0_12px_30px_-8px_rgb(var(--accent-rgb))]">ت</div>
          <h1 className="text-text font-extrabold text-xl mt-4">{tt('تسجيل أكاديمية', 'Register academy')}</h1>
          <p className="text-hint text-xs mt-1 text-center">{tt('يراجع المسؤول طلبك قبل التفعيل', 'An admin reviews your request before activation')}</p>
        </div>

        <form onSubmit={submit}
          className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-5 space-y-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
          <Field label={tt('اسم الأكاديمية', 'Academy name')}>
            <input value={f.name} autoFocus onChange={set('name')} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('البريد الإلكتروني', 'Email')}>
              <input type="email" value={f.email} onChange={set('email')} className={inputCls} />
            </Field>
            <Field label={tt('كلمة المرور', 'Password')}>
              <input type="password" value={f.password} onChange={set('password')} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('الهاتف', 'Phone')}>
              <input value={f.phone} onChange={set('phone')} className={inputCls} />
            </Field>
            <Field label={tt('العنوان', 'City / Address')}>
              <input value={f.address} onChange={set('address')} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('مكان التدريب', 'Training place')}>
              <input value={f.training_place} onChange={set('training_place')} className={inputCls} />
            </Field>
            <Field label={tt('صفحة فيسبوك', 'Facebook page')}>
              <input value={f.facebook_url} onChange={set('facebook_url')} className={inputCls} />
            </Field>
          </div>
          <Field label={tt('الشعار (اختياري)', 'Logo (optional)')}>
            <input type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-hint file:me-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal file:font-bold" />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit" disabled={busy || !f.name || !f.email || !f.password} className="w-full">
            {busy ? tt('جارٍ الإرسال…', 'Submitting…') : tt('إرسال الطلب', 'Submit')}
          </PrimaryButton>
        </form>

        <p className="text-center text-sm text-hint mt-4">
          {tt('لديك حساب؟', 'Have an account?')}{' '}
          <Link href="/login" className="text-aqua font-bold hover:underline">{tt('تسجيل الدخول', 'Sign in')}</Link>
        </p>
      </div>
    </div>
  );
}

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
    name: '', name_en: '', username: '', password: '', phone: '', email: '',
    facebook_url: '', whatsapp_number: '', training_place: '', address: '', description: '',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  // Registration is open — the academy is live the moment this succeeds, so it
  // lands straight on its own dashboard.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await register({
        ...f,
        username: f.username.trim().toLowerCase(),
        email: f.email.trim().toLowerCase(),
        logo,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : tt('تعذّر التسجيل', 'Registration failed'));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full grid place-items-center py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="تلاعبني" className="w-14 h-14 rounded-2xl shadow-[0_12px_30px_-8px_rgb(var(--accent-rgb))]" />
          <h1 className="text-text font-extrabold text-xl mt-4">{tt('تسجيل أكاديمية', 'Register academy')}</h1>
          <p className="text-hint text-xs mt-1 text-center">
            {tt('التسجيل متاح لأي أكاديمية — حسابك يشتغل فورًا',
                'Open to any academy — your account works right away')}
          </p>
        </div>

        <form onSubmit={submit}
          className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-5 space-y-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
          <Field label={tt('اسم الأكاديمية', 'Academy name')}>
            <input value={f.name} autoFocus onChange={set('name')} className={inputCls} />
          </Field>
          <Field label={tt('الاسم بالإنجليزية (اختياري)', 'Name in English (optional)')}>
            <input value={f.name_en} onChange={set('name_en')} dir="ltr" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('اسم المستخدم', 'Username')}>
              <input name="username" id="username" type="text"
                value={f.username} onChange={set('username')} dir="ltr"
                autoComplete="username" className={inputCls} />
            </Field>
            <Field label={tt('كلمة المرور', 'Password')}>
              <input name="new-password" id="new-password" type="password"
                value={f.password} onChange={set('password')}
                autoComplete="new-password" className={inputCls} />
            </Field>
          </div>
          <p className="text-hint text-[11px] -mt-1">
            {tt('اسم المستخدم ده اللي هتدخل بيه — احفظه.', 'This username is what you sign in with — keep it.')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('الهاتف *', 'Phone *')}>
              <input name="phone" type="tel" value={f.phone} onChange={set('phone')}
                dir="ltr" inputMode="tel" autoComplete="tel" className={inputCls} />
            </Field>
            <Field label={tt('واتساب', 'WhatsApp')}>
              <input value={f.whatsapp_number} onChange={set('whatsapp_number')} dir="ltr" className={inputCls} />
            </Field>
          </div>
          <p className="text-hint text-[11px] -mt-1">
            {tt('الهاتف مطلوب — منظم البطولة بيتواصل بيه معاك.',
                'The phone number is required — it is how an organizer reaches you.')}
          </p>
          <Field label={tt('صفحة فيسبوك', 'Facebook page')}>
            <input value={f.facebook_url} onChange={set('facebook_url')} dir="ltr" className={inputCls} />
          </Field>
          <Field label={tt('البريد الإلكتروني (اختياري)', 'Email (optional)')}>
            <input name="email" type="email" value={f.email} onChange={set('email')}
              dir="ltr" autoComplete="email" className={inputCls} />
          </Field>
          <Field label={tt('الشعار (اختياري)', 'Logo (optional)')}>
            <input type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-hint file:me-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal file:font-bold" />
          </Field>

          {/* Profile details — everything a visitor sees on the academy page.
              All optional; filling them now means the profile looks complete
              from day one. Photos, branches and staff are added on the dashboard. */}
          <div className="pt-2 border-t border-bdr">
            <p className="text-teal text-xs font-bold mb-3">{tt('بيانات الملف (اختياري)', 'Profile details (optional)')}</p>
            <div className="space-y-4">
              <Field label={tt('مكان التدريب', 'Training place')}>
                <input value={f.training_place} onChange={set('training_place')} className={inputCls}
                  placeholder={tt('مثال: نادي الجزيرة، ملعب 2', 'e.g. Gezira Club, Pitch 2')} />
              </Field>
              <Field label={tt('العنوان', 'Address')}>
                <input value={f.address} onChange={set('address')} className={inputCls}
                  placeholder={tt('المدينة / الحي', 'City / district')} />
              </Field>
              <Field label={tt('نبذة عن الأكاديمية', 'About the academy')}>
                <textarea value={f.description} onChange={set('description')} rows={3} className={inputCls}
                  placeholder={tt('الفئات، سنوات الخبرة، الإنجازات…', 'Age groups, years of experience, achievements…')} />
              </Field>
            </div>
          </div>

          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit"
            disabled={busy || !f.name.trim() || !f.username.trim() || !f.password || !f.phone.trim()}
            className="w-full">
            {busy ? tt('جارٍ التسجيل…', 'Creating…') : tt('إنشاء الحساب', 'Create account')}
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

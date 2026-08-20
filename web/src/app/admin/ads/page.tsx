'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { Field, inputCls } from '@/components/admin/formKit';
import { useAdminAuth } from '@/context/AdminAuthContext';
import {
  apiListAds, apiCreateAd, apiUpdateAd, apiDeleteAd, apiAdStats, apiUploadImage,
  type AdminAd, type AdStatRow, type AdDailyRow,
} from '@/lib/adminApi';

export default function AdminAdsPage() {
  return <AdminShell title="الإعلانات"><AdsGate /></AdminShell>;
}

// Same editor-permission gate the news/venues page uses, so a viewer-only
// account sees the lock screen rather than a create form that would 403 on save.
function AdsGate() {
  const { canEdit } = useAdminAuth();
  if (!canEdit) {
    return (
      <div className="bg-cardBg border border-bdr rounded-2xl p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-text text-sm font-bold">تحتاج صلاحية «محرّر» أو أعلى</p>
        <p className="text-hint text-xs mt-2">تواصل مع المدير العام لترقية حسابك.</p>
      </div>
    );
  }
  return <AdsTab />;
}

// An ad carries just one image (shown full-screen), so this is the single-image
// counterpart of ImagePicker: a URL field plus a device upload.
function SingleImage({ token, value, onChange }: { token: string; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {value
        ? <img src={value} alt="" className="w-16 h-16 rounded-lg object-cover bg-darkBg border border-bdr flex-shrink-0" />
        : <div className="w-16 h-16 rounded-lg bg-darkBg border border-bdr grid place-items-center text-xl flex-shrink-0">📢</div>}
      <div className="flex-1 space-y-2">
        <input value={value} onChange={e => onChange(e.target.value)} dir="ltr" placeholder="رابط الصورة https://…" className={inputCls} />
        <div className="flex gap-2">
          <label className="flex-1 text-center border border-dashed border-aqua/40 rounded-lg py-1.5 text-aqua text-xs font-bold cursor-pointer hover:bg-aqua/5">
            {busy ? 'جارٍ الرفع…' : '📤 رفع صورة'}
            <input type="file" accept="image/*" hidden disabled={busy}
              onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { onChange(await apiUploadImage(token, file)); } finally { setBusy(false); e.target.value = ''; } }} />
          </label>
          {value && <button type="button" onClick={() => onChange('')} className="text-loss text-xs font-bold border border-loss/40 rounded-lg px-3">حذف الصورة</button>}
        </div>
      </div>
    </div>
  );
}

// First-party ad analytics: per-ad totals + a 30-day trend. `embedded` shows it
// as its own always-open panel (the الإحصائيات sub-tab); otherwise it's a
// collapsible section that loads on first open.
function AdStats({ token, embedded = false }: { token: string; embedded?: boolean }) {
  const [open, setOpen] = useState(embedded);
  const [data, setData] = useState<{ ads: AdStatRow[]; daily: AdDailyRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    apiAdStats(token).then(setData).catch(e => setErr(e instanceof Error ? e.message : 'خطأ')).finally(() => setLoading(false));
  }, [token]);

  // In its own tab, fetch straight away instead of waiting for a click.
  useEffect(() => { if (embedded) load(); }, [embedded, load]);

  const toggle = () => { const n = !open; setOpen(n); if (n && !data) load(); };

  const totalImpr = data?.ads.reduce((s, a) => s + a.impressions, 0) ?? 0;
  const totalClk  = data?.ads.reduce((s, a) => s + a.clicks, 0) ?? 0;
  const ctr = totalImpr ? (totalClk / totalImpr * 100) : 0;
  const maxDaily = Math.max(1, ...(data?.daily.map(d => d.impressions) ?? [1]));

  return (
    <div className="bg-cardBg border border-bdr rounded-xl overflow-hidden">
      {!embedded && (
        <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 text-start">
          <span className="text-text font-bold text-sm">📊 إحصائيات الإعلانات</span>
          <span className={`text-hint transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </button>
      )}
      {open && (
        <div className={`px-4 pb-4 space-y-3 ${embedded ? 'pt-4' : 'border-t border-bdr pt-3'}`}>
          {loading && <p className="text-hint text-sm text-center py-3">جارٍ التحميل…</p>}
          {err && <p className="text-loss text-sm text-center py-2">{err}</p>}
          {data && !loading && (<>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="مشاهدات" value={totalImpr} color="text-aqua" />
              <StatBox label="نقرات" value={totalClk} color="text-win" />
              <StatBox label="نسبة النقر" value={`${ctr.toFixed(1)}%`} color="text-gold" />
            </div>
            {data.daily.length > 0 && (() => {
              // Line (sparkline) of daily impressions. The SVG is stretched to
              // fill the width (preserveAspectRatio=none), so the stroke uses
              // non-scaling-stroke to stay an even thickness.
              const n = data.daily.length;
              const W = 300, H = 60, pad = 5;
              const px = (i: number) => n <= 1 ? W / 2 : pad + (i / (n - 1)) * (W - pad * 2);
              const py = (v: number) => H - pad - (v / maxDaily) * (H - pad * 2);
              const line = data.daily.map((d, i) => `${px(i).toFixed(1)},${py(d.impressions).toFixed(1)}`).join(' ');
              const area = `${px(0).toFixed(1)},${H - pad} ${line} ${px(n - 1).toFixed(1)},${H - pad}`;
              const last = data.daily[n - 1];
              return (
                <div>
                  <p className="text-hint text-[11px] mb-1">آخر 30 يوم — مشاهدات</p>
                  <div className="bg-darkBg border border-bdr rounded-lg p-2">
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-16">
                      <polygon points={area} className="fill-aqua/10" />
                      <polyline points={line} className="fill-none stroke-aqua" strokeWidth={1.5}
                        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                  </div>
                  <p className="text-hint text-[10px] mt-1 text-end">
                    {last.date}: <span className="text-aqua tnum">{last.impressions}</span> مشاهدة
                  </p>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              {data.ads.map(a => (
                <div key={a.id} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-lg px-3 py-2">
                  <span className="flex-1 text-text text-sm truncate">{a.name}</span>
                  <span className="text-aqua text-xs tnum">{a.impressions} 👁</span>
                  <span className="text-win text-xs tnum">{a.clicks} 👆</span>
                  <span className="text-gold text-xs tnum w-12 text-end">{a.ctr}%</span>
                </div>
              ))}
              {data.ads.length === 0 && <p className="text-hint text-sm text-center py-2">لا بيانات بعد</p>}
            </div>
            <button onClick={load} className="text-aqua text-xs font-bold">↻ تحديث</button>
          </>)}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-darkBg border border-bdr rounded-lg py-3 text-center">
      <p className={`font-extrabold text-xl tnum ${color}`}>{value}</p>
      <p className="text-hint text-[10px] mt-0.5">{label}</p>
    </div>
  );
}

function AdsTab() {
  const { token } = useAdminAuth();
  const [items, setItems] = useState<AdminAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminAd | null>(null);
  // Two sub-tabs: manage (form + list) and stats (analytics).
  const [sub, setSub] = useState<'manage' | 'stats'>('manage');

  const load = useCallback(() => {
    if (!token) return;
    apiListAds(token).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['manage', '📢 الإعلانات'], ['stats', '📊 الإحصائيات']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setSub(v)}
            className={`flex-1 text-sm font-bold py-2.5 rounded-xl border transition-colors ${sub === v ? 'bg-aqua text-on-accent border-transparent' : 'bg-cardBg border-bdr text-teal'}`}>
            {l}
          </button>
        ))}
      </div>

      {sub === 'stats' ? (
        token && <AdStats token={token} embedded />
      ) : (
        <div className="space-y-5">
          {editing
            ? <AdForm key={editing.id} token={token!} ad={editing} onCancel={() => setEditing(null)}
                onSaved={() => { setEditing(null); load(); }} />
            : <AdForm token={token!} onSaved={load} />}
          <div>
            <p className="text-text font-bold text-sm mb-2">الإعلانات {!loading && `(${items.length})`}</p>
            {loading ? <p className="text-hint text-sm text-center py-4">جارٍ التحميل…</p> : (
              <div className="space-y-2">
                {items.map(a => {
                  const expired = !!a.expire_date && a.expire_date < today;
                  return (
                    <div key={a.id} className={`bg-gradient-to-b from-cardBg to-cardBg2 border rounded-xl p-3 flex items-center gap-3 ${expired ? 'border-loss/40' : 'border-bdr'}`}>
                      {a.image
                        ? <img src={a.image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-14 h-14 rounded-lg bg-darkBg grid place-items-center text-xl flex-shrink-0">📢</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-text text-sm font-bold truncate">{a.name}</p>
                        <p className={`text-[11px] mt-0.5 ${expired ? 'text-loss' : 'text-hint'}`}>
                          {a.expire_date ? `ينتهي ${a.expire_date}` : 'دائم'}{expired && ' · منتهٍ'}
                        </p>
                      </div>
                      <button onClick={() => { setEditing(a); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="text-aqua text-xs font-bold border border-aqua/40 bg-aqua/10 rounded-lg px-3 py-1.5">تعديل</button>
                      <button onClick={async () => { if (confirm(`حذف الإعلان: «${a.name}»؟`)) { await apiDeleteAd(token!, a.id); load(); } }}
                        className="text-loss text-xs font-bold border border-loss/40 bg-loss/10 rounded-lg px-3 py-1.5">حذف</button>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="text-hint text-sm text-center py-4">لا توجد إعلانات</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Shared by create and edit, like NewsForm, so the two never drift apart.
function AdForm({ token, ad, onSaved, onCancel }: {
  token: string; ad?: AdminAd; onSaved: () => void; onCancel?: () => void;
}) {
  const blank = {
    name: '', image: '', link: '', start_date: '', expire_date: '', weight: '1',
    placement: 'interstitial', feed_position: '3', feed_repeat: '',
    mobile_number: '', whatsapp_number: '',
    facebook_link: '', youtube_video: '', location: '', location_url: '',
  };
  const [f, setF] = useState(ad
    ? {
        name: ad.name ?? '', image: ad.image ?? '', link: ad.link ?? '',
        start_date: ad.start_date ?? '', expire_date: ad.expire_date ?? '',
        weight: String(ad.weight ?? 1),
        placement: ad.placement ?? 'interstitial',
        feed_position: String(ad.feed_position ?? 3),
        feed_repeat: ad.feed_repeat != null ? String(ad.feed_repeat) : '',
        mobile_number: ad.mobile_number ?? '', whatsapp_number: ad.whatsapp_number ?? '',
        facebook_link: ad.facebook_link ?? '', youtube_video: ad.youtube_video ?? '',
        location: ad.location ?? '', location_url: ad.location_url ?? '',
      }
    : blank);
  const [active, setActive] = useState<boolean>(ad?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
    setError(null); setBusy(true);
    try {
      if (ad) await apiUpdateAd(token, ad.id, { ...f, active });
      else { await apiCreateAd(token, { ...f, active }); setF(blank); setActive(true); }
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`bg-gradient-to-b from-cardBg to-cardBg2 border rounded-2xl p-4 space-y-3 ${ad ? 'border-aqua/40' : 'border-bdr'}`}>
      <p className="text-aqua font-bold text-sm">{ad ? '✏️ تعديل الإعلان' : '➕ إعلان جديد'}</p>
      <Field label="اسم الإعلان *"><input value={f.name} onChange={e => set('name', e.target.value)} className={inputCls} /></Field>
      <Field label="الصورة (تظهر بملء الشاشة)"><SingleImage token={token} value={f.image} onChange={v => set('image', v)} /></Field>
      <Field label="🔗 رابط الإعلان (بالضغط على الصورة)"><input value={f.link} onChange={e => set('link', e.target.value)} dir="ltr" placeholder="https://…" className={inputCls} /></Field>
      <p className="text-hint text-[11px]">أزرار التواصل تظهر فقط عند تعبئة حقلها.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="📞 رقم الموبايل"><input value={f.mobile_number} onChange={e => set('mobile_number', e.target.value)} dir="ltr" className={inputCls} /></Field>
        <Field label="💬 واتساب (رقم دولي)"><input value={f.whatsapp_number} onChange={e => set('whatsapp_number', e.target.value)} dir="ltr" placeholder="201234567890" className={inputCls} /></Field>
        <Field label="📘 رابط فيسبوك"><input value={f.facebook_link} onChange={e => set('facebook_link', e.target.value)} dir="ltr" className={inputCls} /></Field>
        <Field label="▶ فيديو يوتيوب"><input value={f.youtube_video} onChange={e => set('youtube_video', e.target.value)} dir="ltr" className={inputCls} /></Field>
        <Field label="📍 اسم الموقع"><input value={f.location} onChange={e => set('location', e.target.value)} className={inputCls} /></Field>
        <Field label="🗺️ رابط الموقع (خريطة)"><input value={f.location_url} onChange={e => set('location_url', e.target.value)} dir="ltr" className={inputCls} /></Field>
      </div>
      <Field label="مكان الظهور">
        <div className="grid grid-cols-3 gap-2">
          {([
            ['interstitial', 'ملء الشاشة'],
            ['feed', 'في القائمة'],
            ['both', 'كلاهما'],
          ] as const).map(([val, label]) => (
            <button key={val} type="button" onClick={() => set('placement', val)}
              className={`py-2 rounded-lg border text-xs font-bold ${f.placement === val ? 'border-aqua/60 bg-aqua/10 text-aqua' : 'border-bdr text-hint'}`}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      {(f.placement === 'feed' || f.placement === 'both') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="موضع الإعلان (بعد المباراة رقم N)">
            <input type="number" min="1" value={f.feed_position}
              onChange={e => set('feed_position', e.target.value)} className={inputCls} />
          </Field>
          <Field label="تكرار كل (فارغ = بدون تكرار)">
            <input type="number" min="1" value={f.feed_repeat} placeholder="بدون تكرار"
              onChange={e => set('feed_repeat', e.target.value)} className={inputCls} />
          </Field>
          <p className="col-span-2 text-hint text-[11px]">
            البطاقة تظهر بعد هذا العدد من المباريات بدءًا من مباريات اليوم (حيث تفتح الصفحة). مثال: موضع 3 وتكرار 6 = بعد المباراة 3 ثم 9 ثم 15…
            <br />استخدم صورة بنسبة 2:1 (مثال 1200×600) لأن بطاقة القائمة تعرض الصورة كاملة بدون عنوان.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="تاريخ البدء (فارغ = الآن)"><input type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} /></Field>
        <Field label="تاريخ الانتهاء (فارغ = دائم)"><input type="date" value={f.expire_date} onChange={e => set('expire_date', e.target.value)} className={inputCls} /></Field>
        <Field label="الوزن (الأعلى يظهر أكثر)"><input type="number" min="1" value={f.weight} onChange={e => set('weight', e.target.value)} className={inputCls} /></Field>
        <Field label="الحالة">
          <button type="button" onClick={() => setActive(!active)}
            className={`w-full py-2 rounded-lg border text-sm font-bold ${active ? 'border-win/50 bg-win/10 text-win' : 'border-bdr text-hint'}`}>
            {active ? '✅ مُفعّل' : '⛔ معطّل'}
          </button>
        </Field>
      </div>
      {error && <p className="text-loss text-xs">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy || !f.name.trim()}
          className="flex-1 bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : ad ? 'حفظ التعديل' : 'إضافة الإعلان'}
        </button>
        {onCancel && <button onClick={onCancel} disabled={busy} className="flex-1 text-hint border border-bdr rounded-xl text-xs font-bold py-2.5">إلغاء</button>}
      </div>
    </div>
  );
}

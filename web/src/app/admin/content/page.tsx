'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { useAdminAuth } from '@/context/AdminAuthContext';
import {
  apiCreateNews, apiUpdateNews, apiCreateVenue, apiListVenues, apiUpdateVenue, apiDeleteVenue, apiListNews, apiDeleteNews, apiUploadImage,
  apiListAds, apiCreateAd, apiUpdateAd, apiDeleteAd, apiAdStats,
  apiGetAppVersion, apiSetAppVersion,
  type NotifyResult, type AdminNews, type AdminAd, type AdminVenue,
  type AdStatRow, type AdDailyRow, type AppVersionInfo,
} from '@/lib/adminApi';

export default function AdminContentPage() {
  return <AdminShell title="الأخبار والملاعب والإعلانات"><Content /></AdminShell>;
}

const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";

function NotifyBadge({ n }: { n: NotifyResult }) {
  if (n.status === 'dry_run')
    return <p className="text-gold text-[11px] bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">🔔 تم الحفظ. الإشعار في وضع التجربة (يُرسل بعد ربط Firebase) — موضوعه: {n.topic}</p>;
  if (n.status === 'sent')
    return <p className="text-win text-[11px] bg-win/10 border border-win/30 rounded-lg px-3 py-2">✅ تم الحفظ وإرسال الإشعار.</p>;
  return <p className="text-win text-[11px] bg-win/10 border border-win/30 rounded-lg px-3 py-2">✅ تم الحفظ.</p>;
}

function Content() {
  const { canEdit, isSuperadmin } = useAdminAuth();
  const [tab, setTab] = useState<'news' | 'venue' | 'ads' | 'app'>('news');

  if (!canEdit) {
    return (
      <div className="bg-cardBg border border-bdr rounded-2xl p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-text text-sm font-bold">تحتاج صلاحية «محرّر» أو أعلى</p>
        <p className="text-hint text-xs mt-2">تواصل مع المدير العام لترقية حسابك.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['news', '📰 الأخبار'], ['venue', '🏟️ ملعب'], ['ads', '📢 الإعلانات'],
           ...(isSuperadmin ? [['app', '📱 التطبيق'] as const] : [])] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 text-sm font-bold py-2.5 rounded-xl border transition-colors ${tab === v ? 'bg-aqua text-on-accent border-transparent' : 'bg-cardBg border-bdr text-teal'}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'news' && <NewsTab />}
      {tab === 'venue' && <VenuesTab />}
      {tab === 'ads' && <AdsTab />}
      {tab === 'app' && isSuperadmin && <AppVersionTab />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-teal text-[11px] font-bold mb-1">{label}</label>{children}</div>;
}

// ── image picker (URL + device upload with server-side resizing) ─────────────

function ImagePicker({ token, images, onChange }: { token: string; images: string[]; onChange: (imgs: string[]) => void }) {
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addUrl = () => { const u = url.trim(); if (u) { onChange([...images, u]); setUrl(''); } };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null); setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of Array.from(files)) uploaded.push(await apiUploadImage(token, f));
      onChange([...images, ...uploaded]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'فشل الرفع'); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-bdr bg-darkBg">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => onChange(images.filter((_, x) => x !== i))}
                className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs grid place-items-center">×</button>
              {i === 0 && <span className="absolute bottom-1 right-1 text-[8px] bg-gold text-on-accent px-1.5 py-0.5 rounded font-bold">الغلاف</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={url} onChange={e => setUrl(e.target.value)} dir="ltr" placeholder="رابط صورة https://…" className={inputCls}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
        <button type="button" onClick={addUrl} className="bg-cardBg border border-bdr text-teal text-xs font-bold px-3 rounded-lg whitespace-nowrap">+ رابط</button>
      </div>
      <label className="flex items-center justify-center gap-2 border border-dashed border-aqua/40 rounded-lg py-2.5 text-aqua text-xs font-bold cursor-pointer hover:bg-aqua/5 transition-colors">
        {uploading ? 'جارٍ الرفع…' : '📤 رفع صور من الجهاز (تُضبط أبعادها تلقائيًا)'}
        <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
      </label>
      {err && <p className="text-loss text-xs">{err}</p>}
    </div>
  );
}

// ── news: create form + manage/delete list ───────────────────────────────────

function NewsTab() {
  const { token } = useAdminAuth();
  const [items, setItems] = useState<AdminNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminNews | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiListNews(token).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      {/* Only one form on screen at a time, so there is no doubt about which
          one a save applies to. */}
      {editing
        // Keyed by id: the form seeds its fields on mount, so picking a
        // different item has to remount it or it would keep the first one's text.
        ? <NewsForm key={editing.id} token={token!} news={editing} onCancel={() => setEditing(null)}
            onCreated={() => { setEditing(null); load(); }} />
        : <NewsForm token={token!} onCreated={load} />}
      <div>
        <p className="text-text font-bold text-sm mb-2">الأخبار المنشورة {!loading && `(${items.length})`}</p>
        {loading ? <p className="text-hint text-sm text-center py-4">جارٍ التحميل…</p> : (
          <div className="space-y-2">
            {items.map(n => (
              <div key={n.id} className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl p-3 flex items-center gap-3">
                {n.image_url
                  ? <img src={n.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  : <div className="w-14 h-14 rounded-lg bg-darkBg grid place-items-center text-xl flex-shrink-0">📰</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm font-bold truncate">{n.title_ar || n.title_en}</p>
                  <p className="text-hint text-[11px] mt-0.5">
                    {n.date}{n.images.length > 1 && ` · ${n.images.length} صور`}{!n.is_published && ' · مسودة'}
                  </p>
                </div>
                <button
                  onClick={() => { setEditing(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-aqua text-xs font-bold border border-aqua/40 bg-aqua/10 rounded-lg px-3 py-1.5">
                  تعديل
                </button>
                <button
                  onClick={async () => { if (confirm(`حذف الخبر: «${n.title_ar || n.title_en}»؟`)) { await apiDeleteNews(token!, n.id); load(); } }}
                  className="text-loss text-xs font-bold border border-loss/40 bg-loss/10 rounded-lg px-3 py-1.5">
                  حذف
                </button>
              </div>
            ))}
            {items.length === 0 && <p className="text-hint text-sm text-center py-4">لا توجد أخبار</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// Serves both jobs: with `news` it edits that item, without it creates a new
// one. Sharing the form keeps the two from drifting apart, which is how an
// edit screen ends up missing a field the create screen has.
function NewsForm({ token, news, onCreated, onCancel }: {
  token: string; news?: AdminNews; onCreated: () => void; onCancel?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const blank = { title_ar: '', title_en: '', details_ar: '', date: today, is_published: true };
  const [f, setF] = useState(news
    ? {
      title_ar: news.title_ar ?? '', title_en: news.title_en ?? '',
      details_ar: news.details_ar ?? '', date: news.date,
      is_published: news.is_published,
    }
    : blank);
  const [images, setImages] = useState<string[]>(news?.images ?? []);
  const [result, setResult] = useState<NotifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF({ ...f, [k]: v });

  const submit = async () => {
    setError(null); setBusy(true);
    try {
      if (news) {
        await apiUpdateNews(token, news.id, { ...f, images });
      } else {
        const r = await apiCreateNews(token, { ...f, images });
        setResult(r.notification);
        setF(blank); setImages([]);
      }
      onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`bg-gradient-to-b from-cardBg to-cardBg2 border rounded-2xl p-4 space-y-3 ${news ? 'border-aqua/40' : 'border-bdr'}`}>
      <p className="text-aqua font-bold text-sm">{news ? '✏️ تعديل الخبر' : '➕ خبر جديد'}</p>
      <Field label="العنوان (عربي) *"><input value={f.title_ar} onChange={e => set('title_ar', e.target.value)} className={inputCls} /></Field>
      <Field label="العنوان (إنجليزي)"><input value={f.title_en} onChange={e => set('title_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
      <Field label="التفاصيل"><textarea value={f.details_ar} onChange={e => set('details_ar', e.target.value)} rows={3} className={inputCls} /></Field>
      <Field label="الصور (رابط أو رفع — عدة صور)"><ImagePicker token={token} images={images} onChange={setImages} /></Field>
      <div className="flex items-center gap-3">
        <Field label="التاريخ"><input type="date" value={f.date} onChange={e => set('date', e.target.value)} className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-teal text-xs pt-4">
          <input type="checkbox" checked={f.is_published} onChange={e => set('is_published', e.target.checked)} />
          {news ? 'منشور' : 'نشر + إشعار'}
        </label>
      </div>
      {news && (
        // Editing never re-notifies: the push goes out once, when the item is
        // first published, so a typo fix cannot buzz every phone again.
        <p className="text-hint text-[11px]">لن يُرسل إشعار عند التعديل.</p>
      )}
      {error && <p className="text-loss text-xs">{error}</p>}
      {result && <NotifyBadge n={result} />}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy || !f.title_ar.trim()}
          className="flex-1 bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : news ? 'حفظ التعديل' : 'نشر الخبر'}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={busy}
            className="flex-1 text-hint border border-bdr rounded-xl text-xs font-bold py-2.5">إلغاء</button>
        )}
      </div>
    </div>
  );
}

function VenuesTab() {
  const { token } = useAdminAuth();
  const [items, setItems] = useState<AdminVenue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) return;
    apiListVenues(token).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <VenueForm onCreated={load} />
      <div className="space-y-2">
        <p className="text-teal text-xs font-bold">الملاعب المسجّلة ({items.length})</p>
        {loading && <p className="text-hint text-sm text-center py-4">جارٍ التحميل…</p>}
        {items.map(v => <VenueRow key={v.id} token={token!} venue={v} onSaved={load} />)}
        {!loading && items.length === 0 && <p className="text-hint text-xs text-center py-4">لا توجد ملاعب مسجّلة</p>}
      </div>
    </div>
  );
}

function VenueForm({ onCreated }: { onCreated: () => void }) {
  const { token } = useAdminAuth();
  const [f, setF] = useState({ name_ar: '', name_en: '', url: '' });
  const [result, setResult] = useState<NotifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
    setError(null); setBusy(true);
    try {
      const r = await apiCreateVenue(token!, { ...f });
      setResult(r.notification); setF({ name_ar: '', name_en: '', url: '' }); onCreated();
    }
    catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-3">
      <p className="text-text font-bold text-sm">➕ إضافة ملعب جديد</p>
      <Field label="اسم الملعب (عربي) *"><input value={f.name_ar} onChange={e => set('name_ar', e.target.value)} className={inputCls} /></Field>
      <Field label="اسم الملعب (إنجليزي)"><input value={f.name_en} onChange={e => set('name_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
      <Field label="رابط الخريطة (اختياري)"><input value={f.url} onChange={e => set('url', e.target.value)} dir="ltr" placeholder="https://maps.google.com/…" className={inputCls} /></Field>
      {error && <p className="text-loss text-xs">{error}</p>}
      {result && <NotifyBadge n={result} />}
      <button onClick={submit} disabled={busy || !f.name_ar.trim()}
        className="w-full bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50">
        {busy ? 'جارٍ الحفظ…' : 'إضافة الملعب'}
      </button>
    </div>
  );
}

// A single registered venue: name + optional map link, expandable to an inline
// edit form. Old venues (imported before this screen existed) are editable here.
function VenueRow({ token, venue, onSaved }: { token: string; venue: AdminVenue; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name_ar: venue.name_ar ?? '', name_en: venue.name_en ?? '', url: venue.url ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const open = () => { setF({ name_ar: venue.name_ar ?? '', name_en: venue.name_en ?? '', url: venue.url ?? '' }); setErr(null); setEditing(true); };
  const save = async () => {
    setErr(null); setBusy(true);
    try { await apiUpdateVenue(token, venue.id, { ...f }); setEditing(false); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl p-3">
        <span className="w-9 h-9 rounded-lg bg-aqua/10 grid place-items-center flex-shrink-0">🏟️</span>
        <div className="flex-1 min-w-0">
          <p className="text-text font-bold text-sm truncate">{venue.name_ar || venue.name_en}</p>
          {venue.url
            ? <a href={venue.url} target="_blank" rel="noreferrer" className="text-aqua text-[11px] hover:underline">📍 رابط الخريطة</a>
            : <p className="text-hint text-[11px]">لا يوجد رابط خريطة</p>}
        </div>
        <button onClick={open}
          className="flex-shrink-0 text-xs font-bold text-aqua border border-aqua/40 bg-aqua/10 rounded-lg px-3 py-1.5 hover:bg-aqua/20">
          ✎ تعديل
        </button>
        <button
          onClick={async () => { if (confirm(`حذف الملعب: «${venue.name_ar || venue.name_en}»؟`)) { await apiDeleteVenue(token, venue.id); onSaved(); } }}
          className="flex-shrink-0 text-xs font-bold text-loss border border-loss/40 bg-loss/10 rounded-lg px-3 py-1.5 hover:bg-loss/20">
          حذف
        </button>
      </div>
    );
  }
  return (
    <div className="bg-cardBg2 border border-aqua/30 rounded-xl p-4 space-y-3">
      <p className="text-aqua text-[11px] font-bold">✎ تعديل الملعب</p>
      <Field label="اسم الملعب (عربي) *"><input value={f.name_ar} onChange={e => set('name_ar', e.target.value)} className={inputCls} /></Field>
      <Field label="اسم الملعب (إنجليزي)"><input value={f.name_en} onChange={e => set('name_en', e.target.value)} dir="ltr" className={inputCls} /></Field>
      <Field label="رابط الخريطة (اختياري)"><input value={f.url} onChange={e => set('url', e.target.value)} dir="ltr" placeholder="https://maps.google.com/…" className={inputCls} /></Field>
      {err && <p className="text-loss text-xs">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !f.name_ar.trim()}
          className="flex-1 bg-aqua text-on-accent font-extrabold py-2 rounded-lg text-sm disabled:opacity-50">
          {busy ? '…' : 'حفظ التعديل'}
        </button>
        <button onClick={() => setEditing(false)} className="text-hint text-xs font-bold px-4 border border-bdr rounded-lg">إلغاء</button>
      </div>
    </div>
  );
}

// ── ads: single image picker + create/edit form + manage list ─────────────────

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

// First-party ad analytics: per-ad totals + a 30-day trend, in a collapsible panel.
function AdStats({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ ads: AdStatRow[]; daily: AdDailyRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    apiAdStats(token).then(setData).catch(e => setErr(e instanceof Error ? e.message : 'خطأ')).finally(() => setLoading(false));
  }, [token]);

  const toggle = () => { const n = !open; setOpen(n); if (n && !data) load(); };

  const totalImpr = data?.ads.reduce((s, a) => s + a.impressions, 0) ?? 0;
  const totalClk  = data?.ads.reduce((s, a) => s + a.clicks, 0) ?? 0;
  const ctr = totalImpr ? (totalClk / totalImpr * 100) : 0;
  const maxDaily = Math.max(1, ...(data?.daily.map(d => d.impressions) ?? [1]));

  return (
    <div className="bg-cardBg border border-bdr rounded-xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 text-start">
        <span className="text-text font-bold text-sm">📊 إحصائيات الإعلانات</span>
        <span className={`text-hint transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-bdr pt-3">
          {loading && <p className="text-hint text-sm text-center py-3">جارٍ التحميل…</p>}
          {err && <p className="text-loss text-sm text-center py-2">{err}</p>}
          {data && !loading && (<>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="مشاهدات" value={totalImpr} color="text-aqua" />
              <StatBox label="نقرات" value={totalClk} color="text-win" />
              <StatBox label="نسبة النقر" value={`${ctr.toFixed(1)}%`} color="text-gold" />
            </div>
            {data.daily.length > 0 && (
              <div>
                <p className="text-hint text-[11px] mb-1">آخر 30 يوم — مشاهدات</p>
                <div className="flex items-end gap-0.5 h-16 bg-darkBg border border-bdr rounded-lg p-2">
                  {data.daily.map(d => (
                    <div key={d.date} title={`${d.date}: ${d.impressions} مشاهدة`}
                      className="flex-1 bg-aqua/80 rounded-sm min-h-[3px]"
                      style={{ height: `${(d.impressions / maxDaily) * 100}%` }} />
                  ))}
                </div>
              </div>
            )}
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

  const load = useCallback(() => {
    if (!token) return;
    apiListAds(token).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      {token && <AdStats token={token} />}
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

// ── app version gate: bump this when you publish a new Google Play build ───────

function AppVersionTab() {
  const { token } = useAdminAuth();
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiGetAppVersion(token)
      .then(v => { setInfo(v); setCode(v.version_code); setName(v.version_name); setForce(v.force_update); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const save = async () => {
    setError(null); setMsg(null); setBusy(true);
    try {
      const v = await apiSetAppVersion(token!, { version_code: code.trim(), version_name: name.trim(), force_update: force });
      setInfo(v); setMsg('تم الحفظ. سيظهر التنبيه لمن لديهم إصدار أقدم عند فتح التطبيق.');
    } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="text-hint text-sm text-center py-6">جارٍ التحميل…</p>;

  return (
    <div className="space-y-4">
      <div className="bg-aqua/5 border border-aqua/30 rounded-2xl p-4 space-y-2">
        <p className="text-aqua font-bold text-sm">📱 إصدار تطبيق أندرويد</p>
        <p className="text-hint text-[12px] leading-relaxed">
          عند نشر تحديث جديد على Google Play، اكتب هنا <b>رقم البناء</b> (versionCode) للإصدار الجديد.
          أي مستخدم لديه رقم بناء أقل سيرى رسالة «تحديث متاح» عند فتح التطبيق.
          يجب أن يطابق <code>versionCode</code> في ملف <code>build.gradle</code>.
        </p>
      </div>

      <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="رقم البناء (versionCode) *">
            <input type="number" min="1" value={code} onChange={e => setCode(e.target.value)} dir="ltr" className={inputCls} placeholder="20" />
          </Field>
          <Field label="اسم الإصدار (versionName) *">
            <input value={name} onChange={e => setName(e.target.value)} dir="ltr" className={inputCls} placeholder="12.1.0" />
          </Field>
        </div>
        <button type="button" onClick={() => setForce(!force)}
          className={`w-full py-2 rounded-lg border text-sm font-bold ${force ? 'border-loss/50 bg-loss/10 text-loss' : 'border-bdr text-hint'}`}>
          {force ? '🔒 تحديث إجباري (لا يمكن تأجيله)' : '🔓 تحديث اختياري (يمكن تأجيله)'}
        </button>
        {info && <p className="text-hint text-[11px]">الحالي على الخادم: {info.version_name} (بناء {info.version_code}){info.force_update ? ' · إجباري' : ''}</p>}
        {msg && <p className="text-win text-xs bg-win/10 border border-win/30 rounded-lg px-3 py-2">✅ {msg}</p>}
        {error && <p className="text-loss text-xs">{error}</p>}
        <button onClick={save} disabled={busy || !code.trim() || !name.trim()}
          className="w-full bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}

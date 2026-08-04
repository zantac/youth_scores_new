'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  tHomeAdsAdmin, tCompetitionAdsAdmin, tCreateHomeAd, tCreateCompetitionAd,
  tUpdateAd, tDeleteAd, tAdSettings, tUpdateAdSettings, mediaUrl,
  type TAd, type TAdInput, type TAdSettings,
} from '@/lib/tla3bnyApi';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, EmptyState, useTT } from './kit';

const EMPTY: TAdInput = {
  sponsor_name: '', caption: '', whatsapp_number: '', phone: '',
  facebook_url: '', instagram_url: '', website_url: '', location_url: '', expires_at: '',
  sort_order: 0,
};

/** The priority choices offered in the form, high to low. The numeric value is
 *  the ad's ``sort_order`` (higher = shown first); ads sharing a value rotate
 *  randomly. Kept small and named so admins pick a level, not a raw number. */
const PRIORITY_LEVELS: { value: number; ar: string; en: string }[] = [
  { value: 3, ar: 'عالية', en: 'High' },
  { value: 2, ar: 'متوسطة', en: 'Medium' },
  { value: 1, ar: 'منخفضة', en: 'Low' },
  { value: 0, ar: 'بدون أولوية', en: 'No priority' },
];

/** The chosen level's label, or the raw number for any legacy custom value. */
function priorityLabel(value: number, tt: (ar: string, en: string) => string): string {
  const lvl = PRIORITY_LEVELS.find(p => p.value === value);
  return lvl ? tt(lvl.ar, lvl.en) : String(value);
}

/** The editable fields of an existing ad, as the form wants them (never null). */
function adToInput(ad: TAd): TAdInput {
  return {
    sponsor_name: ad.sponsor_name ?? '', caption: ad.caption ?? '',
    whatsapp_number: ad.whatsapp_number ?? '', phone: ad.phone ?? '',
    facebook_url: ad.facebook_url ?? '', instagram_url: ad.instagram_url ?? '',
    website_url: ad.website_url ?? '', location_url: ad.location_url ?? '',
    expires_at: ad.expires_at ?? '', sort_order: ad.sort_order,
  };
}

/**
 * Sponsor-ads panel. Used two ways:
 *   - super admin, ``competitionId`` omitted → manages the home-screen ads.
 *   - competition admin, ``competitionId`` set → manages that competition's ads,
 *     bounded by the super admin's ``max_ads`` allowance and shown/hidden by the
 *     ``ads_enabled`` switch (both read-only here — only the super admin sets them).
 */
export default function AdsManager({ token, competitionId }: { token: string; competitionId?: number }) {
  const tt = useTT();
  const isComp = competitionId != null;
  const [ads, setAds] = useState<TAd[]>([]);
  const [gate, setGate] = useState<{ enabled: boolean; max: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      if (isComp) {
        const r = await tCompetitionAdsAdmin(competitionId!, token);
        setAds(r.ads); setGate({ enabled: r.ads_enabled, max: r.max_ads });
      } else {
        setAds(await tHomeAdsAdmin(token));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [isComp, competitionId, token]);
  useEffect(() => { reload(); }, [reload]);

  const atCap = isComp && gate != null && ads.length >= gate.max;

  return (
    <div className="space-y-3">
      <ErrorNote>{err}</ErrorNote>

      <AdDisplayControls token={token} onErr={setErr} />

      {isComp && gate != null && (
        <div className={`rounded-xl border px-3 py-2 text-[11px] ${
          gate.enabled ? 'bg-win/10 border-win/30 text-win' : 'bg-loss/10 border-loss/30 text-loss'}`}>
          {gate.enabled
            ? tt(`الإعلانات مفعّلة · مسموح ${gate.max} (مستخدم ${ads.length})`,
                 `Ads enabled · ${gate.max} allowed (${ads.length} used)`)
            : tt('الإعلانات موقوفة من الإدارة — لن تظهر للجمهور حتى تُفعّل.',
                 'Ads are turned off by the administrator — they stay hidden until re-enabled.')}
        </div>
      )}

      {ads.length === 0 && <EmptyState icon="📣" text={tt('لا إعلانات بعد', 'No ads yet')} />}
      {ads.map(ad => (
        <AdRow key={ad.id} ad={ad} token={token} busy={busy} onChange={reload} onBusy={setBusy} onErr={setErr} />
      ))}

      {isComp && atCap ? (
        <p className="text-hint text-xs text-center py-2">
          {tt('وصلت للحد المسموح. اطلب من الإدارة زيادته.', 'Ad limit reached. Ask the administrator to raise it.')}
        </p>
      ) : (isComp && gate != null && gate.max === 0) ? (
        <p className="text-hint text-xs text-center py-2">
          {tt('الإعلانات غير متاحة لهذه البطولة بعد. تواصل مع الإدارة.', 'Ads are not available for this competition yet. Contact the administrator.')}
        </p>
      ) : (
        <AdForm
          requirePoster
          submitLabel={tt('نشر الإعلان', 'Publish ad')}
          busy={busy}
          onSubmit={async (fd, poster) => {
            setBusy(true); setErr(null);
            try {
              if (isComp) await tCreateCompetitionAd(token, competitionId!, fd, poster!);
              else await tCreateHomeAd(token, fd, poster!);
              await reload();
              return true;
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); return false; }
            finally { setBusy(false); }
          }}
        />
      )}
    </div>
  );
}

/** Shared display settings for every sponsor carousel: how fast ads rotate and
 *  how large the posters are. ±1 second and ±5% per click. Both the super admin
 *  and competition admins can change them. */
function AdDisplayControls({ token, onErr }: { token: string; onErr: (s: string | null) => void }) {
  const tt = useTT();
  const [s, setS] = useState<TAdSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { tAdSettings().then(setS).catch(() => {}); }, []);

  const apply = async (next: Partial<TAdSettings>) => {
    setBusy(true); onErr(null);
    try { setS(await tUpdateAdSettings(token, next)); }
    catch (e) { onErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  if (!s) return null;

  const btn = 'w-8 h-8 rounded-lg border border-bdr bg-cardBg2 text-teal font-bold text-lg leading-none disabled:opacity-40';
  const row = (label: string, value: string, onMinus: () => void, onPlus: () => void) => (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-xs font-bold text-teal">{label}</span>
      <button disabled={busy} onClick={onMinus} className={btn} aria-label="−">−</button>
      <span className="w-14 text-center text-sm font-bold text-text tnum">{value}</span>
      <button disabled={busy} onClick={onPlus} className={btn} aria-label="+">+</button>
    </div>
  );

  return (
    <Card className="p-3 space-y-2.5">
      <p className="text-text font-bold text-sm">{tt('عرض الإعلانات', 'Ad display')}</p>
      {row(
        tt('مدة الدوران (ثانية)', 'Rotation (seconds)'),
        `${s.rotation_seconds}s`,
        () => apply({ rotation_seconds: Math.max(1, s.rotation_seconds - 1) }),
        () => apply({ rotation_seconds: Math.min(30, s.rotation_seconds + 1) }),
      )}
      {row(
        tt('حجم البوستر', 'Poster size'),
        `${s.poster_scale}%`,
        () => apply({ poster_scale: Math.max(50, s.poster_scale - 5) }),
        () => apply({ poster_scale: Math.min(200, s.poster_scale + 5) }),
      )}
      <p className="text-[10px] text-hint">
        {tt('يطبَّق على كل إعلانات الموقع والتطبيق.', 'Applies to every ad carousel across the site and app.')}
      </p>
    </Card>
  );
}

function AdRow({ ad, token, busy, onChange, onBusy, onErr }: {
  ad: TAd; token: string; busy: boolean;
  onChange: () => void; onBusy: (b: boolean) => void; onErr: (s: string | null) => void;
}) {
  const tt = useTT();
  const [editing, setEditing] = useState(false);
  const poster = mediaUrl(ad.poster_path);
  const expired = !!ad.expires_at && ad.expires_at < new Date().toISOString().slice(0, 10);

  const toggle = async () => {
    onBusy(true); onErr(null);
    try { await tUpdateAd(token, ad.id, { is_active: !ad.is_active }); onChange(); }
    catch (e) { onErr(e instanceof Error ? e.message : String(e)); } finally { onBusy(false); }
  };
  const remove = async () => {
    if (!confirm(tt('حذف الإعلان؟', 'Delete this ad?'))) return;
    onBusy(true); onErr(null);
    try { await tDeleteAd(token, ad.id); onChange(); }
    catch (e) { onErr(e instanceof Error ? e.message : String(e)); } finally { onBusy(false); }
  };

  if (editing) {
    return (
      <AdForm
        initial={ad}
        submitLabel={tt('حفظ التعديلات', 'Save changes')}
        title={tt('تعديل الإعلان', 'Edit ad')}
        busy={busy}
        onCancel={() => setEditing(false)}
        onSubmit={async (fd, poster) => {
          onBusy(true); onErr(null);
          try { await tUpdateAd(token, ad.id, fd, poster); onChange(); return true; }
          catch (e) { onErr(e instanceof Error ? e.message : String(e)); return false; }
          finally { onBusy(false); }
        }}
      />
    );
  }

  return (
    <Card className="p-2.5 flex items-center gap-3">
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-bold text-text text-sm truncate">{ad.sponsor_name || tt('إعلان', 'Ad')}</div>
        <div className="text-[11px] text-hint truncate">
          {[ad.whatsapp_number && '💬', ad.phone && '📞', ad.facebook_url && 'f', ad.instagram_url && '◎', ad.website_url && '🌐', ad.location_url && '📍']
            .filter(Boolean).join(' ') || tt('بدون أزرار', 'no buttons')}
        </div>
        <div className="flex items-center gap-2 text-[10px]" dir="ltr">
          {ad.expires_at && (
            <span className={expired ? 'text-loss' : 'text-hint'}>{tt('ينتهي', 'Expires')}: {ad.expires_at}</span>
          )}
          {!!ad.sort_order && <span className="text-teal">{tt('أولوية', 'Priority')}: {priorityLabel(ad.sort_order, tt)}</span>}
        </div>
      </div>
      {expired ? (
        <span title={tt('انتهت صلاحية الإعلان — عدّل التاريخ لإعادة تفعيله', 'Ad has expired — edit the date to reactivate')}
          className="text-[11px] font-bold px-2 py-1 rounded-lg border shrink-0 bg-loss/10 text-loss border-loss/30">
          {tt('منتهي', 'Expired')}
        </span>
      ) : (
        <button onClick={toggle}
          className={`text-[11px] font-bold px-2 py-1 rounded-lg border shrink-0 ${
            ad.is_active ? 'bg-win/10 text-win border-win/30' : 'bg-cardBg2 text-hint border-bdr'}`}>
          {ad.is_active ? tt('ظاهر', 'Shown') : tt('مخفي', 'Hidden')}
        </button>
      )}
      <button onClick={() => setEditing(true)} aria-label={tt('تعديل', 'Edit')}
        className="text-hint hover:text-aqua text-sm shrink-0">✏️</button>
      <button onClick={remove} aria-label={tt('حذف', 'Delete')}
        className="text-hint hover:text-loss text-sm shrink-0">🗑</button>
    </Card>
  );
}

function AdForm({ initial, requirePoster = false, submitLabel, title, onSubmit, onCancel, busy }: {
  initial?: TAd;
  requirePoster?: boolean;
  submitLabel: string;
  title?: string;
  onSubmit: (fd: TAdInput, poster: File | null) => Promise<boolean>;
  onCancel?: () => void;
  busy: boolean;
}) {
  const tt = useTT();
  const [f, setF] = useState<TAdInput>(initial ? adToInput(initial) : EMPTY);
  const [poster, setPoster] = useState<File | null>(null);
  const set = (k: keyof TAdInput) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    if (requirePoster && !poster) return;
    const ok = await onSubmit(f, poster);
    if (ok && !initial) { setF(EMPTY); setPoster(null); }
    if (ok && onCancel) onCancel();
  };
  return (
    <Card className="p-3 space-y-2">
      <p className="text-text font-bold text-sm">{title ?? tt('إضافة إعلان راعٍ', 'Add a sponsor ad')}</p>
      <Field label={requirePoster
        ? tt('البوستر (صورة) * · المقاس المفضل 1200×675', 'Poster (image) * · recommended 1200×675')
        : tt('تغيير البوستر (اختياري) · المقاس المفضل 1200×675', 'Change poster (optional) · recommended 1200×675')}>
        <input type="file" accept="image/*" onChange={e => setPoster(e.target.files?.[0] ?? null)}
          className="text-xs text-hint file:me-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-cardBg2 file:text-teal" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={tt('اسم الراعي', 'Sponsor name')}><input value={f.sponsor_name} onChange={set('sponsor_name')} className={inputCls} /></Field>
        <Field label={tt('واتساب', 'WhatsApp')}><input value={f.whatsapp_number} onChange={set('whatsapp_number')} dir="ltr" placeholder="201001234567" className={inputCls} /></Field>
        <Field label={tt('هاتف', 'Phone')}><input value={f.phone} onChange={set('phone')} dir="ltr" className={inputCls} /></Field>
        <Field label={tt('الموقع الالكتروني', 'Website')}><input value={f.website_url} onChange={set('website_url')} dir="ltr" placeholder="https://…" className={inputCls} /></Field>
        <Field label="Facebook"><input value={f.facebook_url} onChange={set('facebook_url')} dir="ltr" placeholder="https://facebook.com/…" className={inputCls} /></Field>
        <Field label="Instagram"><input value={f.instagram_url} onChange={set('instagram_url')} dir="ltr" placeholder="https://instagram.com/…" className={inputCls} /></Field>
        <Field label={tt('📍 الموقع على الخريطة', '📍 Map location')}><input value={f.location_url} onChange={set('location_url')} dir="ltr" placeholder="https://maps.google.com/…" className={inputCls} /></Field>
        <Field label={tt('تاريخ الانتهاء (اختياري)', 'Expiry date (optional)')}><input type="date" value={f.expires_at} onChange={set('expires_at')} dir="ltr" className={inputCls} /></Field>
        <Field label={tt('الأولوية', 'Priority')}>
          <select value={f.sort_order ?? 0} onChange={e => setF({ ...f, sort_order: Number(e.target.value) })} className={inputCls}>
            {PRIORITY_LEVELS.map(p => <option key={p.value} value={p.value}>{tt(p.ar, p.en)}</option>)}
          </select>
        </Field>
      </div>
      <Field label={tt('سطر تعريفي (اختياري)', 'Caption (optional)')}><input value={f.caption} onChange={set('caption')} className={inputCls} /></Field>
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={submit} disabled={busy || (requirePoster && !poster)}>
          {busy ? tt('…', '…') : submitLabel}
        </PrimaryButton>
        {onCancel && (
          <button onClick={onCancel} disabled={busy}
            className="px-4 py-2.5 rounded-xl border border-bdr text-hint text-sm font-bold disabled:opacity-50">
            {tt('إلغاء', 'Cancel')}
          </button>
        )}
      </div>
    </Card>
  );
}

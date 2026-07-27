'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  tNews, tCreateNews, tUpdateNews, tDeleteNews, tUploadImage, mediaUrl,
  type TNews, type TNewsInput,
} from '@/lib/tla3bnyApi';
import { todayStr } from '@/lib/utils';
import { Card, Field, inputCls, PrimaryButton, ErrorNote, useTT } from './kit';

/**
 * The news editor, built like the youthscores admin content panel: one form on
 * screen at a time (create *or* edit, never both), a picker that takes images
 * by URL or straight off the device, a date, a published/draft switch, and a
 * manage list underneath with edit and delete.
 *
 * `compId` null posts site-wide news (super admin); a number posts to that
 * competition (its organizers).
 */
export default function NewsAdmin({ token, compId }: { token: string; compId: number | null }) {
  const tt = useTT();
  const [items, setItems] = useState<TNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TNews | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    tNews({ competition_id: compId ?? undefined, scope: compId == null ? 'site' : undefined, drafts: true }, token)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token, compId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      {/* Keyed by id: the form seeds its fields on mount, so picking a different
          item has to remount it or it would keep the first one's text. */}
      {editing
        ? <NewsForm key={editing.id} token={token} compId={compId} news={editing}
            onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
        : <NewsForm token={token} compId={compId} onSaved={load} />}

      <div>
        <p className="text-text font-bold text-sm mb-2">
          {tt('الأخبار المنشورة', 'Published news')} {!loading && `(${items.length})`}
        </p>
        {loading ? (
          <p className="text-hint text-sm text-center py-4">{tt('جارٍ التحميل…', 'Loading…')}</p>
        ) : (
          <div className="space-y-2">
            {items.map(n => (
              <Card key={n.id} className="p-3 flex items-center gap-3">
                {mediaUrl(n.image_path)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={mediaUrl(n.image_path)!} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  : <div className="w-14 h-14 rounded-lg bg-darkBg grid place-items-center text-xl shrink-0">📰</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm font-bold truncate">{n.title}</p>
                  <p className="text-hint text-[11px] mt-0.5">
                    {n.date}
                    {n.images.length > 1 && ` · ${n.images.length} ${tt('صور', 'photos')}`}
                    {!n.is_published && ` · ${tt('مسودة', 'draft')}`}
                    {compId == null && n.competition_name && ` · ${n.competition_name}`}
                  </p>
                </div>
                <button onClick={() => { setEditing(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-aqua text-xs font-bold border border-aqua/40 bg-aqua/10 rounded-lg px-3 py-1.5">
                  {tt('تعديل', 'Edit')}
                </button>
                <button onClick={async () => {
                  if (confirm(tt(`حذف الخبر: «${n.title}»؟`, `Delete “${n.title}”?`))) { await tDeleteNews(token, n.id); load(); }
                }} className="text-loss text-xs font-bold border border-loss/40 bg-loss/10 rounded-lg px-3 py-1.5">
                  {tt('حذف', 'Delete')}
                </button>
              </Card>
            ))}
            {items.length === 0 && (
              <p className="text-hint text-sm text-center py-4">{tt('لا توجد أخبار', 'No news yet')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Images by URL or device upload. The first is the cover. */
function ImagePicker({ token, images, onChange }: {
  token: string; images: string[]; onChange: (imgs: string[]) => void;
}) {
  const tt = useTT();
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addUrl = () => { const u = url.trim(); if (u) { onChange([...images, u]); setUrl(''); } };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null); setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of Array.from(files)) uploaded.push(await tUploadImage(token, f));
      onChange([...images, ...uploaded]);
    } catch (e) { setErr(e instanceof Error ? e.message : tt('فشل الرفع', 'Upload failed')); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((src, i) => (
            <div key={`${src}-${i}`} className="relative aspect-video rounded-lg overflow-hidden border border-bdr bg-darkBg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(src) ?? src} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => onChange(images.filter((_, x) => x !== i))}
                className="absolute top-1 start-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs grid place-items-center">×</button>
              {i === 0 && (
                <span className="absolute bottom-1 end-1 text-[8px] bg-gold text-on-accent px-1.5 py-0.5 rounded font-bold">
                  {tt('الغلاف', 'Cover')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={url} onChange={e => setUrl(e.target.value)} dir="ltr"
          placeholder={tt('رابط صورة https://…', 'Image URL https://…')} className={inputCls}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
        <button type="button" onClick={addUrl}
          className="bg-cardBg border border-bdr text-teal text-xs font-bold px-3 rounded-lg whitespace-nowrap">
          + {tt('رابط', 'URL')}
        </button>
      </div>
      <label className="flex items-center justify-center gap-2 border border-dashed border-aqua/40 rounded-lg py-2.5 text-aqua text-xs font-bold cursor-pointer hover:bg-aqua/5 transition-colors">
        {uploading ? tt('جارٍ الرفع…', 'Uploading…') : tt('📤 رفع صور من الجهاز', '📤 Upload photos from device')}
        <input type="file" accept="image/*" multiple hidden disabled={uploading}
          onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
      </label>
      {err && <p className="text-loss text-xs">{err}</p>}
    </div>
  );
}

// Serves both jobs: with `news` it edits that item, without it creates a new
// one. Sharing the form keeps the two from drifting apart, which is how an edit
// screen ends up missing a field the create screen has.
function NewsForm({ token, compId, news, onSaved, onCancel }: {
  token: string; compId: number | null; news?: TNews; onSaved: () => void; onCancel?: () => void;
}) {
  const tt = useTT();
  const blank: TNewsInput = { title: '', body: '', date: todayStr(), is_published: true };
  const [f, setF] = useState<TNewsInput>(news
    ? { title: news.title, body: news.body ?? '', date: news.date ?? todayStr(), is_published: news.is_published }
    : blank);
  const [images, setImages] = useState<string[]>(news?.images ?? []);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof TNewsInput, v: string | boolean) => setF({ ...f, [k]: v });

  const submit = async () => {
    setError(null); setOk(false); setBusy(true);
    try {
      const payload = { ...f, images };
      if (news) await tUpdateNews(token, news.id, payload);
      else { await tCreateNews(token, compId, payload); setF(blank); setImages([]); setOk(true); }
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : tt('خطأ', 'Error')); }
    finally { setBusy(false); }
  };

  return (
    <Card className={`p-4 space-y-3 ${news ? 'border-aqua/40' : ''}`}>
      <p className="text-aqua font-bold text-sm">
        {news ? tt('✏️ تعديل الخبر', '✏️ Edit article') : tt('➕ خبر جديد', '➕ New article')}
      </p>
      <Field label={tt('العنوان *', 'Title *')}>
        <input value={f.title} onChange={e => set('title', e.target.value)} className={inputCls} />
      </Field>
      <Field label={tt('التفاصيل', 'Details')}>
        <textarea value={f.body} onChange={e => set('body', e.target.value)} rows={4} className={inputCls} />
      </Field>
      <Field label={tt('الصور (رابط أو رفع — عدة صور، الأولى هي الغلاف)', 'Photos (URL or upload — first is the cover)')}>
        <ImagePicker token={token} images={images} onChange={setImages} />
      </Field>
      <div className="flex items-end gap-3">
        <Field label={tt('التاريخ', 'Date')}>
          <input type="date" value={f.date} onChange={e => set('date', e.target.value)} className={inputCls} />
        </Field>
        <label className="flex items-center gap-2 text-teal text-xs pb-3">
          <input type="checkbox" checked={f.is_published !== false}
            onChange={e => set('is_published', e.target.checked)} />
          {tt('منشور', 'Published')}
        </label>
      </div>
      <p className="text-hint text-[11px]">
        {tt('الخبر غير المنشور يظهر لك أنت فقط.', 'An unpublished article is visible only to you.')}
      </p>
      <ErrorNote>{error}</ErrorNote>
      {ok && <p className="text-win text-xs font-bold">✓ {tt('تم النشر', 'Published')}</p>}
      <div className="flex gap-2">
        <PrimaryButton onClick={submit} disabled={busy || !f.title.trim()} className="flex-1">
          {busy ? tt('جارٍ الحفظ…', 'Saving…') : news ? tt('حفظ التعديل', 'Save changes') : tt('نشر الخبر', 'Publish')}
        </PrimaryButton>
        {onCancel && (
          <button onClick={onCancel} disabled={busy}
            className="flex-1 text-hint border border-bdr rounded-xl text-xs font-bold py-2.5">
            {tt('إلغاء', 'Cancel')}
          </button>
        )}
      </div>
    </Card>
  );
}

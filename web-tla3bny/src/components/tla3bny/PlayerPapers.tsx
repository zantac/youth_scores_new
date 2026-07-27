'use client';
import { useState } from 'react';
import {
  tUpdatePlayer, tDeletePlayerFile, mediaUrl,
  type TPlayerFile, type TDocSource,
} from '@/lib/tla3bnyApi';
import { useTT } from './kit';

/** Papers are private: only the owning academy/team and the competition's
 *  admins ever receive them from the API, so nothing here is on public pages. */

const linkCls = 'text-[11px] font-bold text-aqua hover:underline shrink-0';
const fileInputCls =
  'text-[10px] text-hint file:me-1 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cardBg2 file:text-teal max-w-[8.5rem]';

/** Which competitions demand a given paper — shown so a coach knows why. */
function askedBy(doc: string, sources: TDocSource[]): string[] {
  return sources
    .filter(s => s.competition_name && s.documents.includes(doc))
    .map(s => s.competition_name as string);
}

export function PapersProgress({ required, files }: { required: string[]; files: TPlayerFile[] }) {
  const tt = useTT();
  const have = new Set(files.map(f => f.label).filter(Boolean));
  const done = required.filter(d => have.has(d)).length;
  if (required.length === 0) return null;
  const complete = done === required.length;
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
      complete ? 'text-win bg-win/10 border-win/30' : 'text-gold bg-gold/10 border-gold/30'}`}>
      {complete ? tt('الأوراق مكتملة', 'Papers complete') : `${done}/${required.length} ${tt('ورقة', 'papers')}`}
    </span>
  );
}

/**
 * The upload slots for one player — one row per required paper, so an academy
 * or coach can see at a glance what is still missing and attach it.
 */
export function PapersUploader({
  token, playerId, required, sources = [], files, onChange,
}: {
  token: string; playerId: number; required: string[];
  sources?: TDocSource[]; files: TPlayerFile[];
  onChange: () => void | Promise<void>;
}) {
  const tt = useTT();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (label: string, file: File) => {
    setErr(null); setBusy(label);
    try {
      await tUpdatePlayer(token, playerId, {}, null, [{ label, file }]);
      await onChange();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const remove = async (f: TPlayerFile) => {
    if (!confirm(tt('حذف الورقة؟', 'Delete this paper?'))) return;
    setErr(null); setBusy(f.label ?? '');
    try { await tDeletePlayerFile(token, playerId, f.id); await onChange(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  // Anything uploaded under a label the requirements no longer mention still
  // belongs to the player, so keep showing it rather than hiding it.
  const extra = files.filter(f => !f.label || !required.includes(f.label));

  return (
    <div className="space-y-1.5">
      {required.length === 0 && (
        <p className="text-[11px] text-hint">{tt('لا أوراق مطلوبة', 'No papers required')}</p>
      )}
      {required.map(doc => {
        const f = files.find(x => x.label === doc);
        const asks = askedBy(doc, sources);
        return (
          <div key={doc} className="bg-darkBg border border-bdr rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text flex-1 min-w-0 truncate">
                {f ? <span className="text-win">✓ </span> : <span className="text-gold">• </span>}{doc}
              </span>
              {f && <a href={mediaUrl(f.file_path) ?? '#'} target="_blank" rel="noreferrer" className={linkCls}>{tt('عرض', 'View')}</a>}
              {f && <button onClick={() => remove(f)} className="text-hint hover:text-loss text-xs shrink-0">🗑</button>}
              <input type="file" accept="image/*,.pdf" disabled={busy === doc}
                onChange={e => { const file = e.target.files?.[0]; if (file) upload(doc, file); e.target.value = ''; }}
                className={fileInputCls} />
            </div>
            {asks.length > 0 && (
              <p className="text-[10px] text-hint mt-0.5 truncate">{tt('مطلوبة في', 'Required by')}: {asks.join('، ')}</p>
            )}
            {busy === doc && <p className="text-[10px] text-teal mt-0.5">{tt('جارٍ الرفع…', 'Uploading…')}</p>}
          </div>
        );
      })}
      {extra.map(f => (
        <div key={f.id} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-xl px-3 py-2">
          <span className="text-xs text-hint flex-1 min-w-0 truncate">{f.label || f.original_name || tt('ملف', 'File')}</span>
          <a href={mediaUrl(f.file_path) ?? '#'} target="_blank" rel="noreferrer" className={linkCls}>{tt('عرض', 'View')}</a>
          <button onClick={() => remove(f)} className="text-hint hover:text-loss text-xs shrink-0">🗑</button>
        </div>
      ))}
      {err && <p className="text-loss text-[11px]">{err}</p>}
    </div>
  );
}

/**
 * Read-only papers for the admin panel: every uploaded file opens in a new
 * tab, and anything the competition asked for but never received is called out.
 */
export function PapersReview({
  files = [], required = [], missing = [],
}: { files?: TPlayerFile[]; required?: string[]; missing?: string[] }) {
  const tt = useTT();
  if (required.length === 0 && files.length === 0) {
    return <p className="text-[11px] text-hint">{tt('لا أوراق', 'No papers')}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map(f => (
        <a key={f.id} href={mediaUrl(f.file_path) ?? '#'} target="_blank" rel="noreferrer"
          className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-aqua bg-aqua/10 border-aqua/30 hover:bg-aqua/20">
          📎 {f.label || f.original_name || tt('ملف', 'File')}
        </a>
      ))}
      {missing.map(d => (
        <span key={d} className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-loss bg-loss/10 border-loss/30">
          ✕ {d}
        </span>
      ))}
    </div>
  );
}

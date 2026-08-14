'use client';
import { useState } from 'react';
import {
  tDownloadSubCompDocs, tDeleteSubCompDocs,
  tDownloadCompDocs, tDeleteCompDocs,
  type TDocDeleteResult,
} from '@/lib/tla3bnyApi';
import { PrimaryButton, ErrorNote, useTT } from './kit';

type Scope =
  | { kind: 'sub'; id: number }
  | { kind: 'comp'; id: number };

/**
 * Download / delete registration documents for a finished competition or one of
 * its sub-competitions. Download is available to any competition admin; delete
 * (destructive, to reclaim storage) is super-admin only. Both are gated on the
 * competition being finished.
 */
export default function DocumentsManager({
  token, scope, finished, canDelete,
}: {
  token: string;
  scope: Scope;
  finished: boolean;
  canDelete: boolean;
}) {
  const tt = useTT();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<TDocDeleteResult | null>(null);

  const isSub = scope.kind === 'sub';

  if (!finished) {
    return (
      <p className="text-[11px] text-hint">
        📄 {tt('يمكن تنزيل/حذف أوراق اللاعبين بعد انتهاء البطولة.',
              'Player documents can be downloaded/deleted after the competition is finished.')}
      </p>
    );
  }

  const download = async () => {
    setErr(''); setResult(null); setDownloading(true);
    try {
      await (isSub ? tDownloadSubCompDocs(token, scope.id) : tDownloadCompDocs(token, scope.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : tt('تعذّر التنزيل', 'Download failed'));
    } finally {
      setDownloading(false);
    }
  };

  const del = async () => {
    const warn = isSub
      ? tt('حذف كل أوراق هذه البطولة الفرعية نهائيًا من الخادم؟ تأكد أنك نزّلتها أولًا.',
           'Permanently delete all documents for this sub-competition from the server? Make sure you downloaded them first.')
      : tt('حذف كل أوراق هذه البطولة نهائيًا من الخادم؟ تأكد أنك نزّلتها أولًا.',
           'Permanently delete ALL documents for this competition from the server? Make sure you downloaded them first.');
    if (!confirm(warn)) return;
    setErr(''); setResult(null); setDeleting(true);
    try {
      const r = isSub ? await tDeleteSubCompDocs(token, scope.id) : await tDeleteCompDocs(token, scope.id);
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tt('تعذّر الحذف', 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <PrimaryButton onClick={download} disabled={downloading} className="text-sm">
          {downloading
            ? tt('جارٍ التجهيز…', 'Preparing…')
            : tt('⬇ تنزيل الأوراق (ZIP)', '⬇ Download documents (ZIP)')}
        </PrimaryButton>
        {canDelete && (
          <button
            onClick={del}
            disabled={deleting}
            className="text-sm font-extrabold py-2.5 px-5 rounded-xl border border-loss/40 text-loss bg-loss/10 disabled:opacity-50 hover:bg-loss/20 transition-colors"
          >
            {deleting
              ? tt('جارٍ الحذف…', 'Deleting…')
              : tt('🗑 حذف الأوراق من الخادم', '🗑 Delete documents from server')}
          </button>
        )}
      </div>

      <ErrorNote>{err}</ErrorNote>

      {result && (
        <div className="text-xs bg-win/10 border border-win/30 rounded-lg px-3 py-2 space-y-1">
          <p className="text-win font-bold">
            {tt(`تم حذف ${result.deleted_files} ملف.`, `Deleted ${result.deleted_files} file(s).`)}
          </p>
          {result.skipped_players.length > 0 && (
            <div className="text-gold">
              <p className="font-bold">
                {tt(`تم تخطي ${result.skipped_players.length} لاعب (أوراقهم مشتركة):`,
                    `Skipped ${result.skipped_players.length} player(s) with shared documents:`)}
              </p>
              <p className="text-hint">
                {result.skipped_players.map(s => s.player_name || `#${s.player_id}`).join('، ')}
              </p>
            </div>
          )}
          {result.failed.length > 0 && (
            <p className="text-loss">
              {tt(`تعذّر حذف ${result.failed.length} ملف من التخزين.`,
                  `Failed to delete ${result.failed.length} file(s) from storage.`)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

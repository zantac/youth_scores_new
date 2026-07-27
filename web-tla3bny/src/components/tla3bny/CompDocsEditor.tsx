'use client';
import { useState } from 'react';
import { tUpdateCompetition, type TCompetition } from '@/lib/tla3bnyApi';
import { inputCls, PrimaryButton, useTT } from './kit';

/**
 * The registration papers a competition demands of every player entered in it.
 * The organiser lists as many as they need, one per line; each line becomes a
 * labelled upload slot on the player, and the uploads stay admin-only.
 *
 * Used by the super admin (Admin → Competitions) and by a competition's own
 * admin (Manage → Papers) — both are allowed to PUT the competition.
 */
export default function CompDocsEditor({
  token, comp, reload,
}: { token: string; comp: TCompetition; reload: () => void }) {
  const tt = useTT();
  const [docs, setDocs] = useState((comp.required_documents ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      await tUpdateCompetition(token, comp.id, {}, null, docs.split('\n').map(x => x.trim()).filter(Boolean));
      setOk(true); setTimeout(() => setOk(false), 1500);
      reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <span className="block text-teal text-xs font-bold">
        {tt('أوراق اللاعبين المطلوبة (سطر لكل ورقة)', 'Required player papers (one per line)')}
      </span>
      <textarea value={docs} onChange={e => setDocs(e.target.value)} rows={5} className={inputCls}
        placeholder={tt('شهادة الميلاد', 'Birth certificate')} />
      <p className="text-[10px] text-hint">
        {tt('أضف ما تشاء. ترفعها الأكاديمية لكل لاعب على حدة، وتظهر هنا في لوحة الإدارة فقط — لا تظهر للجمهور.',
            'Add as many as you need. Academies upload them for each player, and they appear here in the admin panel only — never publicly.')}
      </p>
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={save} disabled={busy} className="text-sm">{tt('حفظ الأوراق', 'Save papers')}</PrimaryButton>
        {ok && <span className="text-win text-sm">✓</span>}
        {err && <span className="text-loss text-[11px]">{err}</span>}
      </div>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  tCompetitionRegistration, tRegisterCompetitionPlayer, tUploadRegistrationDocs,
  tRemoveRosterPlayer, tReplaceCompPlayer,
  type TCompetitionRegistration, type TRegistrationPlayer, type LabeledDoc,
} from '@/lib/tla3bnyApi';
import Spinner from '@/components/ui/Spinner';
import { Card, PrimaryButton, ErrorNote, EmptyState, LogoAvatar, useTT, useName } from './kit';

const STATUS_META: Record<string, { ar: string; en: string; cls: string }> = {
  pending:  { ar: 'بانتظار الاعتماد', en: 'Pending',  cls: 'text-gold bg-gold/10 border-gold/30' },
  approved: { ar: 'معتمد',            en: 'Approved', cls: 'text-win bg-win/10 border-win/30' },
  rejected: { ar: 'مرفوض',            en: 'Rejected', cls: 'text-loss bg-loss/10 border-loss/30' },
  replaced: { ar: 'مُستبدَل',          en: 'Replaced', cls: 'text-hint bg-hint/10 border-hint/30' },
};

/** Registers this team's squad players in ONE competition, each with that
 *  competition's own required papers. Reused for every active competition the
 *  team is in, so a second competition (or the same one next season) gets a
 *  fresh, independent registration and document set. */
export default function CompetitionRegistration({ token, entryId, onChange }: {
  token: string; entryId: number; onChange?: () => void;
}) {
  const tt = useTT();
  const nm = useName();
  const [reg, setReg] = useState<TCompetitionRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  // Staged (not-yet-uploaded) papers, keyed by `${playerId}:${label}`.
  const [docFiles, setDocFiles] = useState<Record<string, File>>({});

  const load = useCallback(async () => {
    try { setReg(await tCompetitionRegistration(token, entryId)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [token, entryId]);
  useEffect(() => { load(); }, [load]);

  const pickedDocs = (playerId: number): LabeledDoc[] =>
    (reg?.required_documents ?? []).flatMap(label => {
      const f = docFiles[`${playerId}:${label}`];
      return f ? [{ label, file: f }] : [];
    });
  const setDoc = (playerId: number, label: string, file: File | null) =>
    setDocFiles(prev => {
      const n = { ...prev }; const k = `${playerId}:${label}`;
      if (file) n[k] = file; else delete n[k];
      return n;
    });
  const clearDocs = (playerId: number) =>
    setDocFiles(prev => Object.fromEntries(
      Object.entries(prev).filter(([k]) => !k.startsWith(`${playerId}:`)),
    ));

  const run = async (playerId: number, fn: () => Promise<unknown>) => {
    setErr(null); setBusy(playerId);
    try { await fn(); clearDocs(playerId); await load(); onChange?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const register = (p: TRegistrationPlayer) =>
    run(p.player_id, () => tRegisterCompetitionPlayer(token, entryId, p.player_id, pickedDocs(p.player_id)));
  const uploadDocs = (p: TRegistrationPlayer) =>
    run(p.player_id, () => tUploadRegistrationDocs(token, p.competition_player_id!, pickedDocs(p.player_id)));
  const withdraw = (p: TRegistrationPlayer) => {
    if (!confirm(tt('سحب اللاعب من هذه البطولة؟ سيبقى في تشكيلة الفريق.',
      'Withdraw this player from this competition? They stay on the squad.'))) return;
    run(p.player_id, () => tRemoveRosterPlayer(token, p.competition_player_id!));
  };
  const replace = (p: TRegistrationPlayer) => {
    if (!confirm(tt('استبدال هذا اللاعب المعتمد؟ لن يكمل هذه البطولة.',
      'Replace this approved player? They will not continue in this competition.'))) return;
    run(p.player_id, () => tReplaceCompPlayer(token, p.competition_player_id!));
  };

  if (loading) return <Spinner />;
  if (!reg) return <ErrorNote>{err}</ErrorNote>;

  const full = reg.max_players !== null && reg.registered_count >= reg.max_players;

  return (
    <div className="space-y-3">
      <ErrorNote>{err}</ErrorNote>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-black text-text text-sm truncate">
            {reg.sub_competition_name
              ? `${reg.competition_name} · ${reg.sub_competition_name}`
              : reg.competition_name}
          </p>
          {!reg.registration_open && (
            <p className="text-[11px] text-loss font-bold mt-0.5">
              {tt('التسجيل مغلق في هذه البطولة', 'Registration is closed for this competition')}
            </p>
          )}
        </div>
        <span className={`text-xs font-bold tabular-nums shrink-0 ${full ? 'text-loss' : 'text-teal'}`}>
          {reg.registered_count}{reg.max_players !== null ? ` / ${reg.max_players}` : ''} {tt('لاعب', 'players')}
        </span>
      </div>

      {reg.required_documents.length > 0 && (
        <p className="text-[11px] text-hint">
          {tt('الأوراق المطلوبة لهذه البطولة:', 'Papers required for this competition:')}{' '}
          <span className="text-text">{reg.required_documents.join('، ')}</span>
        </p>
      )}

      {reg.players.length === 0 ? (
        <EmptyState icon="⚽" text={tt('لا لاعبين في التشكيلة بعد — أضِفهم من قسم «اللاعبون».',
          'No squad players yet — add them from the "Players" section.')} />
      ) : reg.players.map(p => {
        const st = p.registration_status;
        const meta = st ? STATUS_META[st] : null;
        const supplied = new Set(p.files.map(f => f.label).filter(Boolean) as string[]);
        const canEditDocs = reg.registration_open && st !== 'replaced' && st !== 'approved';
        const canRegister = st === null && reg.registration_open && !full;
        const staged = pickedDocs(p.player_id).length;
        return (
          <Card key={p.player_id} className={`p-3 space-y-2 ${st === 'rejected' ? 'border-loss/40' : st === 'pending' ? 'border-gold/40' : ''}`}>
            <div className="flex items-center gap-3">
              <LogoAvatar src={p.photo_path} name={nm(p.player_name, p.player_name_en)} size={36} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-text text-sm truncate">{nm(p.player_name, p.player_name_en)}</div>
                <div className="text-[11px] text-hint">
                  {[p.position, p.jersey_number != null ? `#${p.jersey_number}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              {meta ? (
                <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 shrink-0 ${meta.cls}`}>
                  {tt(meta.ar, meta.en)}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-hint bg-hint/10 border border-hint/30 rounded-full px-2 py-0.5 shrink-0">
                  {tt('غير مسجّل', 'Not entered')}
                </span>
              )}
            </div>

            {st === 'rejected' && p.rejection_reason && (
              <p className="text-loss/90 text-[11px]">{tt('سبب الرفض:', 'Rejection reason:')} {p.rejection_reason}</p>
            )}

            {/* Paper slots — this competition's own required documents. */}
            {reg.required_documents.length > 0 && (st === null || canEditDocs) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {reg.required_documents.map(doc => {
                  const has = supplied.has(doc);
                  const picked = !!docFiles[`${p.player_id}:${doc}`];
                  return (
                    <label key={doc} className="flex items-center gap-2 bg-darkBg border border-bdr rounded-xl px-3 py-2">
                      <span className="text-xs text-text flex-1 min-w-0 truncate">
                        {doc}
                        {picked ? <span className="text-teal"> ✓</span>
                          : has ? <span className="text-win"> ✓</span> : null}
                      </span>
                      <input type="file" accept="image/*,.pdf"
                        onChange={e => setDoc(p.player_id, doc, e.target.files?.[0] ?? null)}
                        className="text-[10px] text-hint file:me-1 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cardBg2 file:text-teal w-28" />
                    </label>
                  );
                })}
              </div>
            )}

            {p.missing_documents.length > 0 && st !== null && st !== 'replaced' && (
              <p className="text-[11px] text-gold">
                {tt('أوراق ناقصة:', 'Missing papers:')} {p.missing_documents.join('، ')}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {canRegister && (
                <PrimaryButton onClick={() => register(p)} disabled={busy === p.player_id} className="text-sm">
                  {busy === p.player_id ? tt('…', '…') : tt('تسجيل في البطولة', 'Enter in competition')}
                </PrimaryButton>
              )}
              {st === null && !reg.registration_open && (
                <span className="text-[11px] text-hint">{tt('التسجيل مغلق', 'Registration closed')}</span>
              )}
              {st === null && reg.registration_open && full && (
                <span className="text-[11px] text-loss">{tt('اكتمل العدد', 'Roster full')}</span>
              )}
              {canEditDocs && st !== null && (
                <button onClick={() => uploadDocs(p)} disabled={busy === p.player_id || staged === 0}
                  className="text-xs font-bold text-teal border border-teal/40 rounded-lg px-3 py-1.5 hover:bg-teal/10 disabled:opacity-40">
                  {busy === p.player_id ? tt('…', '…') : tt('رفع/تحديث الأوراق', 'Upload / update papers')}
                </button>
              )}
              {st === 'pending' && (
                <button onClick={() => withdraw(p)} disabled={busy === p.player_id}
                  className="text-xs font-bold text-loss border border-loss/40 rounded-lg px-3 py-1.5 hover:bg-loss/10 disabled:opacity-40">
                  {tt('سحب', 'Withdraw')}
                </button>
              )}
              {st === 'approved' && reg.replacements_open && (
                <button onClick={() => replace(p)} disabled={busy === p.player_id}
                  className="text-xs font-bold text-gold border border-gold/40 rounded-lg px-3 py-1.5 hover:bg-gold/10 disabled:opacity-40">
                  {tt('استبدال', 'Replace')}
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

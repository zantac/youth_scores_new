'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  tPlayer, tPlayerRegistrations, tTeamRequiredDocs, tPlayerStats,
  mediaUrl,
  type TPlayer, type TPlayerRegistration, type TRequiredDocs, type TPlayerStatTotals,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import { PapersUploader, PapersReview, PapersProgress } from '@/components/tla3bny/PlayerPapers';
import { Card, EmptyState, LogoAvatar, StatusBadge, useTT } from '@/components/tla3bny/kit';

function PlayerContent() {
  const tt = useTT();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const { user, token, academy, team, isSuperAdmin } = useTla3bnyAuth();
  const [p, setP] = useState<TPlayer | null>(null);
  const [regs, setRegs] = useState<TPlayerRegistration[]>([]);
  const [docs, setDocs] = useState<TRequiredDocs>({ documents: [], sources: [] });
  const [stats, setStats] = useState<TPlayerStatTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // The token decides what comes back: papers and rejection reasons are sent
  // only to the owning academy/team and to the competition's admins.
  const load = useCallback(async () => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    try {
      const player = await tPlayer(id, token);
      setP(player);
      tPlayerRegistrations(id, token).then(setRegs).catch(() => setRegs([]));
      tPlayerStats(id).then(r => setStats(r.totals)).catch(() => undefined);
      if (player.current_team_id) {
        tTeamRequiredDocs(player.current_team_id).then(setDocs).catch(() => undefined);
      }
    } catch { setNotFound(true); } finally { setLoading(false); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);

  const refreshPapers = useCallback(async () => {
    if (!id) return;
    try { setP(await tPlayer(id, token)); } catch { /* keep what is on screen */ }
    tPlayerRegistrations(id, token).then(setRegs).catch(() => undefined);
  }, [id, token]);

  if (loading) return <Spinner />;
  if (notFound || !p) return <EmptyState icon="🔍" text={tt('اللاعب غير موجود', 'Player not found')} />;

  // Papers arrive only for an authorised viewer; uploading is for the owner.
  const canSeePapers = p.files != null;
  const canUpload = Boolean(token) && (
    isSuperAdmin
    || (academy != null && academy.id === p.current_academy_id)
    || (team != null && team.id === p.current_team_id)
  );

  const info: [string, string | null][] = [
    [tt('المركز', 'Position'), p.position],
    [tt('القدم/المركز الفرعي', 'Sub-position'), p.sub_position],
    [tt('تاريخ الميلاد', 'Date of birth'), p.dob],
    [tt('الرقم', 'Jersey'), p.jersey_number != null ? `#${p.jersey_number}` : null],
  ];

  const statCells: { label: string; value: number; color: string }[] = stats ? [
    { label: tt('مشاركات', 'Apps'),    value: stats.appearances,  color: 'text-aqua' },
    { label: tt('أهداف', 'Goals'),     value: stats.goals,        color: 'text-green-400' },
    { label: tt('صناعة', 'Assists'),   value: stats.assists,      color: 'text-teal' },
    { label: tt('ك. أصفر', 'Yellow'),  value: stats.yellow_cards, color: 'text-yellow-400' },
    { label: tt('ك. أحمر', 'Red'),     value: stats.red_cards,    color: 'text-loss' },
  ] : [];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {p.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(p.photo_path)!}
            alt={p.name}
            className="w-full h-72 object-cover object-top"
          />
        ) : null}
        <div className="p-4 flex items-center gap-4">
          {!p.photo_path && <LogoAvatar src={null} name={p.name} size={72} />}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-text">{p.name}</h1>
            <p className="text-sm text-teal font-bold">{p.position}</p>
          </div>
          {canSeePapers && <PapersProgress required={docs.documents} files={p.files ?? []} />}
        </div>
      </Card>

      {statCells.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {statCells.map(({ label, value, color }) => (
            <Card key={label} className="p-3 flex flex-col items-center gap-1">
              <span className={`text-2xl font-black ${color}`}>{value}</span>
              <span className="text-[11px] text-hint text-center">{label}</span>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-3">
          {info.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-hint">{k}</dt>
              <dd className="font-bold text-text text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Registration papers — never rendered for a public visitor. */}
      {canSeePapers && (
        <Card className="p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-black text-text">{tt('أوراق التسجيل', 'Registration papers')}</h2>
            <span className="text-[10px] text-hint">{tt('تظهر للأكاديمية والمنظّم فقط', 'Visible to the academy and organiser only')}</span>
          </div>
          {canUpload ? (
            <PapersUploader token={token as string} playerId={p.id} required={docs.documents}
              sources={docs.sources} files={p.files ?? []} onChange={refreshPapers} />
          ) : (
            <PapersReview files={p.files} required={docs.documents}
              missing={docs.documents.filter(d => !(p.files ?? []).some(f => f.label === d))} />
          )}
        </Card>
      )}

      {/* What each organiser decided, and why — so the academy knows what to fix. */}
      {user && regs.length > 0 && (
        <Card className="p-4 space-y-2">
          <h2 className="font-black text-text">{tt('طلبات القيد', 'Registration requests')}</h2>
          {regs.map(r => (
            <div key={r.id} className="border-t border-bdr pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text font-bold">{r.competition_name}</span>
                <StatusBadge status={r.status} label={
                  { pending: tt('قيد المراجعة', 'Under review'), approved: tt('مقبول', 'Approved'), rejected: tt('مرفوض', 'Rejected') }[r.status]
                } />
              </div>
              {r.status === 'rejected' && (
                <p className="text-loss text-xs mt-1 bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">
                  <span className="font-bold">{tt('سبب الرفض', 'Reason')}: </span>
                  {r.rejection_reason || tt('لم يُذكر سبب', 'No reason given')}
                </p>
              )}
              {(r.missing_documents?.length ?? 0) > 0 && (
                <p className="text-[11px] text-gold mt-1">
                  {tt('أوراق ناقصة', 'Missing papers')}: {r.missing_documents?.join('، ')}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export default function PlayerPage() {
  return <Suspense fallback={<Spinner />}><PlayerContent /></Suspense>;
}

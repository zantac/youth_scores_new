'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  tPlayer, tPlayerRegistrations, tTeamRequiredDocs, tPlayerStats, tPlayerAds, tPlayerBans,
  tOrganizerSetPlayerPhoto, tOrganizerRotatePlayerPhoto, mediaUrl, docSupplied,
  type TPlayer, type TPlayerRegistration, type TRequiredDocs, type TPlayerStatTotals, type TPlayerStatRow, type TAd, type TPlayerBan,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import Spinner from '@/components/ui/Spinner';
import AdCard from '@/components/tla3bny/AdCard';
import FollowPlayerButton from '@/components/tla3bny/FollowPlayerButton';
import { PapersUploader, PapersReview, PapersProgress } from '@/components/tla3bny/PlayerPapers';
import { PlayerAchievements } from '@/components/tla3bny/Honours';
import { Card, EmptyState, LogoAvatar, StatusBadge, ZoomableImage, useTT } from '@/components/tla3bny/kit';

function PlayerContent() {
  const tt = useTT();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const { user, token, academy, team, isSuperAdmin } = useTla3bnyAuth();
  const [p, setP] = useState<TPlayer | null>(null);
  const [regs, setRegs] = useState<TPlayerRegistration[]>([]);
  const [docs, setDocs] = useState<TRequiredDocs>({ documents: [], sources: [] });
  const [stats, setStats] = useState<TPlayerStatTotals | null>(null);
  const [byComp, setByComp] = useState<TPlayerStatRow[]>([]);
  const [ads, setAds] = useState<TAd[]>([]);
  const [adIdx, setAdIdx] = useState(0);
  const [bans, setBans] = useState<TPlayerBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  // The token decides what comes back: papers and rejection reasons are sent
  // only to the owning academy/team and to the competition's admins.
  const load = useCallback(async () => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    try {
      const player = await tPlayer(id, token);
      setP(player);
      tPlayerRegistrations(id, token).then(setRegs).catch(() => setRegs([]));
      tPlayerStats(id).then(r => { setStats(r.totals); setByComp(r.by_competition); }).catch(() => undefined);
      if (player.current_team_id) {
        tTeamRequiredDocs(player.current_team_id).then(setDocs).catch(() => undefined);
      }
    } catch { setNotFound(true); } finally { setLoading(false); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);

  // Sponsor ads pooled from the player's competitions. When several run, rotate
  // the single large poster so each sponsor gets a turn.
  useEffect(() => { if (id) tPlayerAds(id).then(setAds).catch(() => setAds([])); }, [id]);
  useEffect(() => { if (id) tPlayerBans(id).then(setBans).catch(() => setBans([])); }, [id]);
  useEffect(() => {
    if (ads.length <= 1) return;
    const t = setInterval(() => setAdIdx(i => (i + 1) % ads.length), 6000);
    return () => clearInterval(t);
  }, [ads.length]);

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

  // An organizer of any competition this player is entered in may refresh the
  // identity photo (academies sometimes register an old one) — scoped to the
  // photo only; the backend keeps approvals intact and bypasses the edit freeze.
  // The backend sets can_set_photo on the same rule as the photo endpoints, so
  // this is true for every organizer type (owner, collaborator, data-entry).
  const canOrganizerSetPhoto = Boolean(token) && p.can_set_photo === true;

  const onPickPhoto = async (file: File | undefined) => {
    if (!file || !token) return;
    setPhotoErr(null); setPhotoBusy(true);
    try { setP(await tOrganizerSetPlayerPhoto(token, p.id, file)); }
    catch (e) { setPhotoErr(e instanceof Error ? e.message : String(e)); }
    finally { setPhotoBusy(false); }
  };

  const onRotate = async (direction: 'left' | 'right') => {
    if (!token) return;
    setPhotoErr(null); setPhotoBusy(true);
    try { setP(await tOrganizerRotatePlayerPhoto(token, p.id, direction)); }
    catch (e) { setPhotoErr(e instanceof Error ? e.message : String(e)); }
    finally { setPhotoBusy(false); }
  };

  const info: [string, string | null][] = [
    [tt('المركز', 'Position'), p.position],
    [tt('القدم/المركز الفرعي', 'Sub-position'), p.sub_position],
    [tt('تاريخ الميلاد', 'Date of birth'), p.dob],
    // Only present for an authorised viewer (owning academy/team or an admin) —
    // the API omits it from the public shape, same as the papers.
    [tt('الرقم القومي', 'National ID'), p.national_id ?? null],
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
          // Fit the whole photo (no crop/zoom): shrink it to fit the band,
          // centered, with a dark backdrop behind any letterbox bars. Tap to
          // open it full-screen.
          <ZoomableImage
            src={mediaUrl(p.photo_path)!}
            alt={p.name}
            className="w-full h-72 object-contain object-center bg-darkBg"
          />
        ) : null}
        <div className="p-4 flex items-center gap-4">
          {!p.photo_path && <LogoAvatar src={null} name={p.name} size={72} />}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-text">{p.name}</h1>
            <p className="text-sm text-teal font-bold">{p.position}</p>
          </div>
          <FollowPlayerButton playerId={p.id} />
          {canSeePapers && <PapersProgress required={docs.documents} files={p.files ?? []} />}
        </div>
        {/* Organizer-only: refresh a stale identity photo for match-day checks.
            Scoped to the photo; keeps the player's approval as-is. */}
        {canOrganizerSetPhoto && (
          <div className="px-4 pb-4 -mt-1">
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex items-center gap-2 text-xs font-bold rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                photoBusy ? 'opacity-60 pointer-events-none border-bdr text-hint' : 'border-aqua/40 text-aqua hover:bg-aqua/10'
              }`}>
                📷 {photoBusy ? tt('جارٍ الرفع…', 'Uploading…') : tt('تحديث صورة اللاعب', 'Update player photo')}
                <input type="file" accept="image/*" className="hidden" disabled={photoBusy}
                  onChange={e => { onPickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {/* Rotate — for upside-down / sideways uploads. Only with a photo. */}
              {p.photo_path && (
                <>
                  <button onClick={() => onRotate('left')} disabled={photoBusy}
                    title={tt('تدوير لليسار', 'Rotate left')}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-bdr text-text hover:border-aqua hover:text-aqua disabled:opacity-40">↺</button>
                  <button onClick={() => onRotate('right')} disabled={photoBusy}
                    title={tt('تدوير لليمين', 'Rotate right')}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-bdr text-text hover:border-aqua hover:text-aqua disabled:opacity-40">↻</button>
                </>
              )}
            </div>
            <p className="text-[11px] text-hint mt-1">
              {tt('للمنظّم فقط — تُحدَّث الصورة دون التأثير على اعتماد اللاعب.',
                  'Organizer only — updates the photo without affecting the player’s approval.')}
            </p>
            {photoErr && <p className="text-loss text-[11px] mt-1">{photoErr}</p>}
          </div>
        )}
      </Card>

      {/* Match ban / disqualification — public disciplinary notice. */}
      {bans.length > 0 && (
        <Card className="p-4 border-loss/40 bg-loss/[0.06] space-y-1">
          <p className="text-loss font-black text-sm">🚫 {tt('عقوبات', 'Disciplinary')}</p>
          {bans.map(b => (
            <p key={b.id} className="text-[12px] text-text">
              <span className="font-bold">
                {b.punishment_type === 'disqualification'
                  ? tt('مستبعد من البطولة', 'Disqualified')
                  : tt(`إيقاف ${b.matches} مباريات`, `Banned ${b.matches} matches`)}
              </span>
              {b.competition_name ? <span className="text-hint"> · {b.competition_name}</span> : null}
              {b.reason ? <span className="text-hint"> — {b.reason}</span> : null}
            </p>
          ))}
        </Card>
      )}

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

      {byComp.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-bdr/60 bg-cardBg2/40 font-black text-text text-sm">
            {tt('حسب البطولة', 'By competition')}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-hint text-[11px] border-b border-bdr/40">
                  <th className="text-start font-bold px-3 py-2">{tt('البطولة', 'Competition')}</th>
                  <th className="px-2 py-2 font-bold">{tt('مشاركات', 'Apps')}</th>
                  <th className="px-2 py-2" title={tt('أهداف', 'Goals')}>⚽</th>
                  <th className="px-2 py-2" title={tt('صناعة', 'Assists')}>🅰️</th>
                  <th className="px-2 py-2" title={tt('كروت صفراء', 'Yellow cards')}>🟨</th>
                  <th className="px-2 py-2" title={tt('كروت حمراء', 'Red cards')}>🟥</th>
                </tr>
              </thead>
              <tbody>
                {byComp.map(r => (
                  <tr key={r.competition_id} className="border-b border-bdr/20 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-bold text-text">{r.competition_name}</div>
                      {r.season_name && <div className="text-[10px] text-hint">{r.season_name}</div>}
                    </td>
                    <td className="text-center px-2 py-2 font-black text-aqua">{r.appearances}</td>
                    <td className="text-center px-2 py-2 font-black text-green-400">{r.goals}</td>
                    <td className="text-center px-2 py-2 font-black text-teal">{r.assists}</td>
                    <td className="text-center px-2 py-2 text-yellow-400">{r.yellow_cards}</td>
                    <td className="text-center px-2 py-2 text-loss">{r.red_cards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <PlayerAchievements playerId={p.id} />

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

      {ads.length > 0 && (
        <div className="max-w-[260px] mx-auto">
          <AdCard ad={ads[adIdx % ads.length]} variant="poster" />
        </div>
      )}

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
              missing={docs.documents.filter(d => !docSupplied(d, (p.files ?? []).map(f => f.label)))} />
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

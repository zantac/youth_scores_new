'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  tMatch, tMatchLineups,
  type TMatch, type TLineup, type TMatchEvent,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import PitchView, { type SlotView } from '@/components/tla3bny/PitchView';
import Spinner from '@/components/ui/Spinner';
import { Card, EmptyState, LogoAvatar, useTT } from '@/components/tla3bny/kit';

const EVENT_ICON: Record<string, string> = {
  goal: '⚽', assist: '🅰️', yellow: '🟨', red: '🟥',
  substitution_in: '🔺', substitution_out: '🔻',
};

function MatchContent() {
  const tt = useTT();
  const params = useSearchParams();
  const id = Number(params.get('id'));
  const { user, isSuperAdmin, canAdminCompetition } = useTla3bnyAuth();
  const [m, setM] = useState<TMatch | null>(null);
  const [lineups, setLineups] = useState<TLineup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    tMatch(id).then(setM).catch(() => setNotFound(true)).finally(() => setLoading(false));
    tMatchLineups(id).then(setLineups).catch(() => setLineups([]));
  }, [id]);

  if (loading) return <Spinner />;
  if (notFound || !m) return <EmptyState icon="🔍" text={tt('المباراة غير موجودة', 'Match not found')} />;

  const canManage = isSuperAdmin || canAdminCompetition(m.competition_id);
  const canEditSide = (teamId: number) =>
    canManage || (user?.role === 'team' && user.team_id === teamId);

  const lineupFor = (teamId: number) => lineups.find(l => l.team_id === teamId);
  const toFilled = (l?: TLineup): Record<string, SlotView> => {
    const f: Record<string, SlotView> = {};
    l?.slots.filter(s => !s.is_substitute && s.position_slot).forEach(s => {
      f[s.position_slot!] = { playerId: s.player_id, playerName: s.player_name, photoPath: s.photo_path };
    });
    return f;
  };

  const eventsFor = (teamId: number) =>
    (m.events ?? []).filter(e => e.team_id === teamId && e.event_type !== 'assist');

  const finished = m.status === 'finished';

  return (
    <div className="space-y-4">
      <Link href="/competitions" className="text-sm text-hint hover:text-aqua">← {tt('البطولات', 'Competitions')}</Link>

      <Card className="p-4">
        <div className="text-center text-[11px] text-hint mb-3">
          {[m.competition_name, m.age_category, m.stage_name, m.group_name].filter(Boolean).join(' · ')}
          {m.date && <div className="mt-0.5">{m.date}{m.time ? ` · ${m.time}` : ''}{m.venue ? ` · 📍 ${m.venue}` : ''}</div>}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Link href={`/team?id=${m.home_team_id}`} className="flex flex-col items-center gap-1 min-w-0">
            <LogoAvatar src={m.home_logo} name={m.home_team_name} size={52} />
            <span className="font-bold text-text text-sm text-center truncate w-full">{m.home_team_name}</span>
          </Link>
          <div className="px-2 text-center">
            {m.home_score != null && m.away_score != null ? (
              <div className="font-black text-3xl text-text tnum">{m.home_score}<span className="text-hint mx-1">-</span>{m.away_score}</div>
            ) : <div className="text-hint font-bold">{tt('ضد', 'vs')}</div>}
            <div className="text-[11px] text-hint mt-1">{finished ? tt('انتهت', 'FT') : m.status === 'live' ? tt('مباشر', 'LIVE') : tt('قادمة', 'Upcoming')}</div>
          </div>
          <Link href={`/team?id=${m.away_team_id}`} className="flex flex-col items-center gap-1 min-w-0">
            <LogoAvatar src={m.away_logo} name={m.away_team_name} size={52} />
            <span className="font-bold text-text text-sm text-center truncate w-full">{m.away_team_name}</span>
          </Link>
        </div>
      </Card>

      {/* events */}
      {(m.events?.length ?? 0) > 0 && (
        <Card className="p-4">
          <h2 className="font-black text-text mb-2">{tt('الأحداث', 'Events')}</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <EventList events={eventsFor(m.home_team_id)} align="start" />
            <EventList events={eventsFor(m.away_team_id)} align="end" />
          </div>
        </Card>
      )}

      {/* lineups */}
      {[{ id: m.home_team_id, name: m.home_team_name }, { id: m.away_team_id, name: m.away_team_name }].map(side => {
        const l = lineupFor(side.id);
        return (
          <Card key={side.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-black text-text">{side.name} · {tt('التشكيلة', 'Lineup')}</h2>
              {canEditSide(side.id) && (
                <Link href={`/lineup?match=${m.id}&team=${side.id}`} className="text-xs font-bold text-aqua hover:underline">
                  {l ? tt('تعديل', 'Edit') : tt('إضافة', 'Add')}
                </Link>
              )}
            </div>
            {l ? (
              <>
                <div className="max-w-md mx-auto"><PitchView formation={l.formation} filled={toFilled(l)} /></div>
                {l.slots.some(s => s.is_substitute) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.slots.filter(s => s.is_substitute).map(s => (
                      <span key={s.id} className="flex items-center gap-1 bg-cardBg2 border border-bdr rounded-full ps-1 pe-2 py-0.5">
                        <LogoAvatar src={s.photo_path} name={s.player_name} size={20} />
                        <span className="text-[11px] font-bold text-text">{s.player_name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-hint">{tt('لم تُضف بعد', 'Not submitted yet')}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function EventList({ events, align }: { events: TMatchEvent[]; align: 'start' | 'end' }) {
  return (
    <>
      {events.map(e => (
        <div key={e.id} className={`flex items-center gap-1.5 text-sm ${align === 'end' ? 'flex-row-reverse text-end' : ''}`}>
          <span>{EVENT_ICON[e.event_type] ?? '•'}</span>
          <span className="text-text truncate">{e.player_name}</span>
          {e.minute != null && <span className="text-[11px] text-hint">{e.minute}'</span>}
        </div>
      ))}
    </>
  );
}

export default function MatchPage() {
  return <Suspense fallback={<Spinner />}><MatchContent /></Suspense>;
}

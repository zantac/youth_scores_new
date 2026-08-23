'use client';
import { useState, useEffect, useRef } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { apiStats, type AdminStats } from '@/lib/adminApi';

export default function AdminDashboard() {
  return (
    <AdminShell title="لوحة التحكم">
      <Dashboard />
    </AdminShell>
  );
}

const card = 'bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl';

function Stat({ icon, label, value, tone = 'text-text' }: {
  icon: string; label: string; value: string | number; tone?: string;
}) {
  return (
    <div className={card + ' p-3'}>
      <p className="text-hint text-[11px]">{icon} {label}</p>
      <p className={`${tone} font-extrabold text-xl tnum mt-0.5`}>{value}</p>
    </div>
  );
}

const selectCls = 'w-full bg-cardBg border border-bdr rounded-xl px-3 py-2.5 text-text text-sm outline-none focus:border-aqua';

function Dashboard() {
  const { token, user } = useAdminAuth();
  const [s, setS] = useState<AdminStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  // Default the season filter to the active season on first load. It's a one-off
  // default — the admin can still switch to "كل المواسم" (or clear) and it won't
  // snap back — so a ref guards it rather than re-running whenever seasonId is null.
  const defaulted = useRef(false);

  useEffect(() => {
    if (!token) return;
    apiStats(token, { seasonId, competitionId })
      .then(data => {
        setS(data);
        if (!defaulted.current) {
          defaulted.current = true;
          const active = data.filters.seasons.find(o => o.name === data.active_season);
          if (active) setSeasonId(active.id);
        }
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'خطأ'));
  }, [token, seasonId, competitionId]);

  const filtered = seasonId != null || competitionId != null;
  // The dropdowns read the full lists from the last response, which stay
  // complete under any filter. Competitions are narrowed to the chosen season.
  const seasonOpts = s?.filters.seasons ?? [];
  const compOpts = (s?.filters.competitions ?? [])
    .filter(c => seasonId == null || c.season_id === seasonId);
  const compLabel = (c: { name: string; sector: string; age: string }) =>
    [c.name, c.age, c.sector].filter(Boolean).join(' · ');

  const pickSeason = (id: number | null) => { setSeasonId(id); setCompetitionId(null); };
  // Picking a competition also pins the season dropdown to its season.
  const pickComp = (id: number | null) => {
    setCompetitionId(id);
    if (id != null) {
      const c = s?.filters.competitions.find(x => x.id === id);
      if (c) setSeasonId(c.season_id);
    }
  };

  const pct = s && s.matches.total
    ? Math.round((s.matches.played / s.matches.total) * 100) : 0;

  // Competitions still missing results, most outstanding first — the one part
  // of the dashboard that says what to go and do.
  const pending = (s?.competitions ?? [])
    .filter(c => c.total > c.played)
    .sort((a, b) => (b.total - b.played) - (a.total - a.played));

  // "Most followed" — anonymous device follows (global, not affected by the
  // filter above). Only shown once at least one device has followed something.
  const compFollows = (s?.follows.competitions ?? []).filter(c => c.followers > 0);
  const teamFollows = (s?.follows.teams ?? []).filter(t => t.followers > 0);
  const hasFollows = compFollows.length > 0 || teamFollows.length > 0;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-l from-aqua/[0.08] to-transparent border border-bdr rounded-2xl p-4">
        <p className="text-text text-sm">أهلاً، <span className="text-aqua font-bold">{user?.full_name || user?.username}</span> 👋</p>
        {s?.active_season && <p className="text-hint text-xs mt-1">الموسم الحالي: {s.active_season}</p>}
      </div>

      {/* Season / competition filter — scopes every figure below. */}
      {s && (
        <div className="bg-cardBg border border-bdr rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-teal text-xs font-bold">🔎 تصفية حسب الموسم والبطولة</p>
            {filtered && (
              <button onClick={() => { setSeasonId(null); setCompetitionId(null); }}
                className="text-hint text-[11px] font-bold hover:text-loss">✕ مسح</button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={seasonId ?? ''} onChange={e => pickSeason(e.target.value ? Number(e.target.value) : null)} className={selectCls}>
              <option value="">كل المواسم</option>
              {seasonOpts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select value={competitionId ?? ''} onChange={e => pickComp(e.target.value ? Number(e.target.value) : null)} className={selectCls}>
              <option value="">كل البطولات</option>
              {compOpts.map(o => <option key={o.id} value={o.id}>{compLabel(o)}</option>)}
            </select>
          </div>
        </div>
      )}

      {err && <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{err}</p>}
      {!s && !err && <p className="text-hint text-sm text-center py-6">…</p>}

      {s && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon="🗓️" label="المواسم" value={s.counts.seasons} />
            <Stat icon="🏆" label="البطولات" value={s.counts.competitions} />
            <Stat icon="🎯" label="المراحل السنية" value={s.counts.age_groups} />
            <Stat icon="🛡️" label="الأندية" value={s.counts.clubs} />
            <Stat icon="⚽" label="الفرق" value={s.counts.teams} />
            <Stat icon="👤" label="اللاعبون" value={s.counts.players} />
          </div>

          <div className={card + ' p-4 space-y-2'}>
            <div className="flex items-baseline justify-between">
              <p className="text-text font-bold text-sm">📋 إدخال النتائج</p>
              <p className="text-aqua font-extrabold tnum">{pct}%</p>
            </div>
            <div className="h-2 bg-darkBg rounded-full overflow-hidden">
              <div className="h-full bg-aqua rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-hint text-[11px] tnum">
              {s.matches.played} مكتملة · {s.matches.remaining} متبقية · {s.matches.total} إجمالاً
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat icon="🥅" label="الأهداف" value={s.counts.goals} tone="text-gold" />
            <Stat icon="📈" label="هدف / مباراة" value={s.averages.goals_per_match} tone="text-gold" />
            <Stat icon="🧑‍🏫" label="المدربون" value={s.counts.coaches} />
            <Stat icon="👥" label="لاعب / فريق" value={s.averages.players_per_team} />
            <Stat icon="📰" label="الأخبار" value={s.counts.news} />
            <Stat icon="📍" label="الملاعب" value={s.counts.venues} />
          </div>

          {pending.length > 0 && (
            <div className={card + ' p-4 space-y-2'}>
              <p className="text-text font-bold text-sm">⏳ بطولات لم تكتمل نتائجها</p>
              {pending.slice(0, 6).map(c => (
                <div key={c.id} className="flex items-center gap-2 bg-darkBg/60 border border-bdr rounded-lg px-3 py-1.5">
                  <span className="flex-1 text-text text-xs truncate">
                    {c.name}{c.sector && <span className="text-hint"> · {c.sector}</span>}
                  </span>
                  <span className="text-gold text-xs font-bold tnum flex-shrink-0">{c.total - c.played}</span>
                </div>
              ))}
              {pending.length > 6 && (
                <p className="text-hint text-[11px]">و{pending.length - 6} بطولة أخرى</p>
              )}
            </div>
          )}

          {hasFollows && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FollowList
                title="⭐ البطولات الأكثر متابعة"
                rows={compFollows.map(c => ({
                  id: c.id,
                  label: c.name,
                  sub: [c.age, c.sector].filter(Boolean).join(' · '),
                  followers: c.followers,
                }))}
              />
              <FollowList
                title="⭐ الفرق الأكثر متابعة"
                rows={teamFollows.map(t => ({
                  id: t.id,
                  label: t.name,
                  sub: t.age,
                  followers: t.followers,
                }))}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// One "most followed" column (competitions or teams): top rows with a follower
// count, capped so the card stays compact. Follower = a device that opted into
// notifications for it (web or app), which is what the tally can see.
function FollowList({ title, rows }: {
  title: string;
  rows: { id: number; label: string; sub: string; followers: number }[];
}) {
  const shown = rows.slice(0, 8);
  return (
    <div className={card + ' p-4 space-y-2'}>
      <p className="text-text font-bold text-sm">{title}</p>
      {shown.length === 0 && <p className="text-hint text-xs">لا يوجد متابعون بعد</p>}
      {shown.map(r => (
        <div key={r.id} className="flex items-center gap-2 bg-darkBg/60 border border-bdr rounded-lg px-3 py-1.5">
          <span className="flex-1 min-w-0 text-text text-xs truncate">
            {r.label}{r.sub && <span className="text-hint"> · {r.sub}</span>}
          </span>
          <span className="text-aqua text-xs font-bold tnum flex-shrink-0">👥 {r.followers}</span>
        </div>
      ))}
      {rows.length > 8 && (
        <p className="text-hint text-[11px]">و{rows.length - 8} أخرى</p>
      )}
    </div>
  );
}

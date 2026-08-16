'use client';
import { useMemo, useState } from 'react';
import { apiCreateMatch, type EntryTeam, type MStage, type EntryMatchRow } from '@/lib/adminApi';
import { runOcr, imageToPixels } from '@/lib/ocr/ocrEngine';
import { reconstructFixtures } from '@/lib/ocr/gridReconstruct';
import { matchFixtures } from '@/lib/ocr/matchFixtures';

type Loc = { ar: string; en: string };
const loc = (l?: Loc | null) => (l ? l.ar || l.en : '');
const inputCls = 'w-full bg-darkBg border border-bdr rounded-lg px-2.5 py-2 text-text text-sm outline-none focus:border-aqua';

interface ReviewRow {
  enabled: boolean;
  homeId: string; awayId: string;
  homeScore: number; awayScore: number; // match confidence 0..1
  venue: string; venueMatched: boolean;
  date: string; time: string; week: string;
  rawHome: string; rawAway: string; rawVenue: string;
}

type Phase = 'setup' | 'processing' | 'review' | 'creating' | 'done';

const VENUES_ID = 'import-venues';

export default function ImportFromPhoto({
  token, cid, teams, stages, venues, existing, onCreated, onCancel,
}: {
  token: string; cid: number; teams: EntryTeam[]; stages: MStage[]; venues: string[];
  existing: EntryMatchRow[]; onCreated: () => void; onCancel: () => void;
}) {
  const [stageId, setStageId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [phase, setPhase] = useState<Phase>('setup');
  const [status, setStatus] = useState('');
  const [pct, setPct] = useState(0);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState({ ok: 0, fail: 0 });

  const stage = stages.find(s => String(s.id) === stageId);
  const groups = stage?.groups ?? [];
  const isGroupStage = stage?.type === 'group';
  const ready = Boolean(stageId) && (!isGroupStage || Boolean(groupId));

  const teamOpts = useMemo(
    () => [...teams].sort((a, b) => loc(a.name).localeCompare(loc(b.name), 'ar')), [teams]);
  const teamCandidates = useMemo(
    () => teams.map(t => ({ id: t.id, names: [t.name.ar, t.name.en].filter(Boolean) })), [teams]);

  const setRow = (i: number, patch: Partial<ReviewRow>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onFile = async (file: File) => {
    setErr(null); setPhase('processing'); setPct(0);
    try {
      setStatus('قراءة الصورة…');
      const px = await imageToPixels(file);
      const words = await runOcr(px, {
        onStage: s => setStatus(
          s === 'download' ? 'تنزيل نموذج التعرّف (مرة واحدة)…'
          : s === 'init' ? 'تهيئة المحرّك…' : 'قراءة الجدول…'),
        onProgress: p => { if (p.total) setPct(Math.round((p.loaded / p.total) * 100)); },
      });
      const rec = reconstructFixtures(words, px.width);
      const matched = matchFixtures(rec.fixtures, teamCandidates, venues);
      setWarnings(rec.warnings);
      setRows(matched.map(m => ({
        enabled: true,
        homeId: m.home.id ? String(m.home.id) : '',
        awayId: m.away.id ? String(m.away.id) : '',
        homeScore: m.home.score, awayScore: m.away.score,
        venue: m.venue.value, venueMatched: m.venue.matched,
        date: m.date, time: m.time, week: m.week,
        rawHome: m.raw.home, rawAway: m.raw.away, rawVenue: m.raw.venue,
      })));
      setPhase('review');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذّرت قراءة الصورة');
      setPhase('setup');
    }
  };

  const isDup = (r: ReviewRow) =>
    Boolean(r.homeId) && Boolean(r.awayId) && Boolean(r.date) && existing.some(x =>
      !x.deleted_at && x.date === r.date &&
      String(x.home.id) === r.homeId && String(x.away.id) === r.awayId);

  const enabledCount = rows.filter(r => r.enabled && r.homeId && r.awayId).length;

  const create = async () => {
    setPhase('creating'); setErr(null);
    const group = groups.find(g => String(g.id) === groupId);
    let ok = 0, fail = 0;
    const todo = rows.filter(r => r.enabled && r.homeId && r.awayId);
    for (const r of todo) {
      try {
        await apiCreateMatch(token, cid, {
          home_team_id: Number(r.homeId), away_team_id: Number(r.awayId),
          date: r.date, time: r.time, week: r.week, venue: r.venue, status: 'scheduled',
          stage_id: stageId ? Number(stageId) : undefined,
          group_id: groupId ? Number(groupId) : undefined,
          round: group ? (group.name_ar || group.name_en || '') : undefined,
        });
        ok++;
      } catch { fail++; }
      setCreated({ ok, fail });
    }
    setPhase('done');
    if (ok > 0) onCreated();
  };

  // ── setup / processing gate ──────────────────────────────────────────────────
  if (phase === 'setup' || phase === 'processing') {
    return (
      <div className="bg-cardBg2 border border-aqua/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-aqua font-bold text-sm">📷 استيراد المباريات من صورة</p>
          <button onClick={onCancel} className="text-hint text-xs font-bold">✕ إغلاق</button>
        </div>
        <p className="text-hint text-[11px] leading-relaxed">
          اختر الدور (والمجموعة إن وُجدت) ثم ارفع صورة جدول المباريات. تتم القراءة على جهازك،
          وتُطابَق أسماء الفرق والملاعب مع قاعدة البيانات، وتُراجِعها قبل الحفظ.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <select value={stageId} onChange={e => { setStageId(e.target.value); setGroupId(''); }} className={inputCls}>
            <option value="">— اختر الدور</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en || s.type}</option>)}
          </select>
          {isGroupStage && groups.length > 0 ? (
            <select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}>
              <option value="">— اختر المجموعة</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name_ar || g.name_en || `مجموعة ${g.id}`}</option>)}
            </select>
          ) : <div />}
        </div>

        {phase === 'processing' ? (
          <div className="bg-darkBg border border-bdr rounded-xl p-3 space-y-2">
            <p className="text-teal text-xs">{status}</p>
            {pct > 0 && (
              <div className="h-1.5 bg-cardBg rounded-full overflow-hidden">
                <div className="h-full bg-aqua rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        ) : (
          <label className={`block text-center border-2 border-dashed rounded-xl py-6 cursor-pointer transition-colors ${
            ready ? 'border-aqua/40 text-aqua hover:bg-aqua/10' : 'border-bdr text-hint opacity-50 cursor-not-allowed'}`}>
            <input type="file" accept="image/*" disabled={!ready} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            {ready ? '📤 اختر صورة الجدول' : 'اختر الدور أولاً'}
          </label>
        )}
        {err && <p className="text-loss text-xs">{err}</p>}
      </div>
    );
  }

  // ── review / results ─────────────────────────────────────────────────────────
  return (
    <div className="bg-cardBg2 border border-aqua/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-aqua font-bold text-sm">📋 مراجعة {rows.length} مباراة</p>
        <button onClick={onCancel} className="text-hint text-xs font-bold">✕ إغلاق</button>
      </div>

      {warnings.length > 0 && (
        <div className="bg-gold/10 border border-gold/30 rounded-lg px-3 py-2 space-y-0.5">
          {warnings.map((w, i) => <p key={i} className="text-gold text-[11px]">⚠️ {w}</p>)}
        </div>
      )}

      {phase === 'done' ? (
        <div className="bg-darkBg border border-bdr rounded-xl p-4 text-center space-y-2">
          <p className="text-win font-bold text-sm">✅ تم إنشاء {created.ok} مباراة</p>
          {created.fail > 0 && <p className="text-loss text-xs">فشل {created.fail}</p>}
          <button onClick={onCancel} className="text-aqua text-xs font-bold">إغلاق</button>
        </div>
      ) : (
        <>
          <datalist id={VENUES_ID}>{venues.map(v => <option key={v} value={v} />)}</datalist>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {rows.map((r, i) => {
              const dup = isDup(r);
              const homeWarn = !r.homeId;
              const awayWarn = !r.awayId;
              return (
                <div key={i} className={`rounded-xl border p-2.5 space-y-2 ${
                  r.enabled ? 'bg-darkBg border-bdr' : 'bg-darkBg/40 border-bdr/50 opacity-60'}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={r.enabled} onChange={e => setRow(i, { enabled: e.target.checked })} />
                    <span className="text-hint text-[10px]">#{i + 1}</span>
                    {dup && <span className="text-gold text-[10px] font-bold">↻ موجودة</span>}
                    <span className="flex-1" />
                    <span className="text-hint text-[9px]">🏠 {r.rawHome} × {r.rawAway} 🚩</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                    <select value={r.homeId} onChange={e => setRow(i, { homeId: e.target.value })}
                      className={`${inputCls} ${homeWarn ? 'border-gold' : ''}`}>
                      <option value="">— المضيف {homeWarn ? '⚠️' : ''}</option>
                      {teamOpts.map(t => <option key={t.id} value={t.id}>{loc(t.name)}</option>)}
                    </select>
                    <span className="text-hint text-xs">×</span>
                    <select value={r.awayId} onChange={e => setRow(i, { awayId: e.target.value })}
                      className={`${inputCls} ${awayWarn ? 'border-gold' : ''}`}>
                      <option value="">— الضيف {awayWarn ? '⚠️' : ''}</option>
                      {teamOpts.map(t => <option key={t.id} value={t.id}>{loc(t.name)}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input type="date" value={r.date} onChange={e => setRow(i, { date: e.target.value })} className={inputCls} />
                    <input type="time" value={r.time} onChange={e => setRow(i, { time: e.target.value })} className={inputCls} />
                    <input value={r.week} onChange={e => setRow(i, { week: e.target.value })} placeholder="الجولة" className={inputCls} />
                  </div>
                  <input value={r.venue} onChange={e => setRow(i, { venue: e.target.value, venueMatched: true })}
                    list={VENUES_ID} placeholder="الملعب"
                    className={`${inputCls} ${!r.venueMatched && r.venue ? 'border-gold/50' : ''}`} />
                </div>
              );
            })}
          </div>

          {err && <p className="text-loss text-xs">{err}</p>}
          <button onClick={create} disabled={phase === 'creating' || enabledCount === 0}
            className="w-full bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50">
            {phase === 'creating'
              ? `جارٍ الإنشاء… ${created.ok}/${enabledCount}`
              : `تأكيد وإنشاء ${enabledCount} مباراة`}
          </button>
        </>
      )}
    </div>
  );
}

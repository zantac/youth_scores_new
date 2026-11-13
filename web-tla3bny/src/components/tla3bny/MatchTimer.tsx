'use client';
import { useCallback, useEffect, useState } from 'react';
import { tGetMatchTimer, tSetMatchTimer } from '@/lib/tla3bnyApi';
import { useTT } from './kit';

function fmt(s: number): string {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/** The live match stopwatch — organizer-only, server-backed so it survives a
 *  refresh and stays in sync across whoever has the match open. Renders in a
 *  sticky bar; ticks locally while running and re-syncs periodically.
 *  Pass a new `syncKey` value to trigger an immediate re-sync (e.g. after a
 *  status change that auto-started/stopped the timer). */
export default function MatchTimer({ token, matchId, syncKey }: { token: string; matchId: number; syncKey?: number }) {
  const tt = useTT();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(async () => {
    try { const t = await tGetMatchTimer(token, matchId); setRunning(t.running); setElapsed(t.elapsed_seconds); }
    catch { /* keep whatever is on screen */ }
  }, [token, matchId]);

  useEffect(() => { sync(); const iv = setInterval(sync, 15000); return () => clearInterval(iv); }, [sync]);
  // Re-sync when the parent signals a status-driven timer change.
  useEffect(() => { if (syncKey && syncKey > 0) sync(); }, [syncKey, sync]);
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, [running]);

  const act = async (action: 'start' | 'pause' | 'stop') => {
    setBusy(true);
    try { const t = await tSetMatchTimer(token, matchId, action); setRunning(t.running); setElapsed(t.elapsed_seconds); }
    catch { /* ignore — a poll will re-sync */ } finally { setBusy(false); }
  };

  return (
    <div className="bg-cardBg2/95 backdrop-blur border-b border-bdr flex items-center gap-3 px-4 py-2">
      <span className="text-[10px] font-bold text-hint uppercase tracking-wide shrink-0">{tt('توقيت المباراة', 'Match timer')}</span>
      <span className={`tnum font-black text-2xl leading-none ${running ? 'text-win' : 'text-text'}`}>{fmt(elapsed)}</span>
      <div className="flex items-center gap-2 ms-auto shrink-0">
        {!running ? (
          <button onClick={() => act('start')} disabled={busy} title={tt('تشغيل', 'Start')}
            className="w-9 h-9 rounded-full bg-win/15 border border-win/40 text-win grid place-items-center text-lg disabled:opacity-50">▶</button>
        ) : (
          <button onClick={() => act('pause')} disabled={busy} title={tt('إيقاف مؤقت', 'Pause')}
            className="w-9 h-9 rounded-full bg-gold/15 border border-gold/40 text-gold grid place-items-center text-lg disabled:opacity-50">⏸</button>
        )}
        <button onClick={() => { if (confirm(tt('تصفير المؤقّت؟', 'Reset the timer?'))) act('stop'); }}
          disabled={busy} title={tt('إيقاف وتصفير', 'Stop & reset')}
          className="w-9 h-9 rounded-full bg-loss/15 border border-loss/40 text-loss grid place-items-center text-lg disabled:opacity-50">⏹</button>
      </div>
    </div>
  );
}

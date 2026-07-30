'use client';
import { useState, useCallback } from 'react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import AdminShell from '@/components/admin/AdminShell';
import { apiSearchPlayers, apiMergePlayer, type PlayerSearchResult } from '@/lib/adminApi';

const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";

function PlayerPicker({ token, label, selected, onSelect }: {
  token: string; label: string;
  selected: PlayerSearchResult | null;
  onSelect: (p: PlayerSearchResult) => void;
}) {
  const [q, setQ] = useState(selected?.name ?? '');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (val: string) => {
    setQ(val);
    if (val.length < 2) { setResults([]); return; }
    setLoading(true);
    try { setResults(await apiSearchPlayers(token, val)); }
    finally { setLoading(false); }
  }, [token]);

  const pick = (p: PlayerSearchResult) => {
    setQ(p.name ?? '');
    setResults([]);
    onSelect(p);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-teal text-[11px] font-bold">{label}</label>
      <input value={q} onChange={e => search(e.target.value)}
        placeholder="اكتب اسم اللاعب للبحث…" className={inputCls} />
      {loading && <p className="text-hint text-[11px]">بحث…</p>}
      {results.length > 0 && (
        <ul className="bg-darkBg border border-bdr rounded-lg overflow-hidden">
          {results.map(p => (
            <li key={p.id}>
              <button onClick={() => pick(p)}
                className="w-full text-start px-3 py-2.5 text-sm text-text hover:bg-bdr/40 transition-colors border-b border-bdr/40 last:border-0">
                <span className="font-medium">{p.name}</span>
                <span className="text-hint text-[10px] mr-2">مواليد {p.birth_year}</span>
                <span className="text-hint text-[10px] mr-1">#{p.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && results.length === 0 && (
        <p className="text-teal text-[11px]">✓ {selected.name} (مواليد {selected.birth_year})</p>
      )}
    </div>
  );
}

export default function PlayersPage() {
  const { token, canEdit } = useAdminAuth();
  const [source, setSource] = useState<PlayerSearchResult | null>(null);
  const [target, setTarget] = useState<PlayerSearchResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sourceKey, setSourceKey] = useState(0);
  const [targetKey, setTargetKey] = useState(0);

  const reset = () => {
    setSource(null); setTarget(null); setConfirm(false);
    setErr(null); setDone(null);
    setSourceKey(k => k + 1); setTargetKey(k => k + 1);
  };

  const merge = async () => {
    if (!token || !source || !target) return;
    setErr(null); setBusy(true);
    try {
      const r = await apiMergePlayer(token, source.id, target.id);
      setDone(`تم دمج "${source.name}" في "${r.target_name}" بنجاح.`);
      setSource(null); setTarget(null); setConfirm(false);
      setSourceKey(k => k + 1); setTargetKey(k => k + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <AdminShell title="اللاعبون">
      <div className="space-y-4 max-w-lg">
        <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-4">
          <div>
            <p className="text-text font-bold text-sm mb-1">دمج لاعبَين</p>
            <p className="text-hint text-[11px] leading-relaxed">
              عندما يُدخَل اسم لاعب بأكثر من صياغة ينتهي به الأمر في أكثر من صف.
              هنا يمكن دمج السجل المُكرَّر (المصدر) في السجل الصحيح (الهدف):
              تنتقل كل الأهداف والبطاقات والتبديلات إلى سجل الهدف ثم يُحذف سجل المصدر نهائيًا.
            </p>
          </div>

          {!canEdit ? (
            <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">
              يتطلب صلاحية محرّر أو مدير عام.
            </p>
          ) : (
            <>
              <PlayerPicker key={`src-${sourceKey}`} token={token!} label="المصدر — السجل المُكرَّر الذي سيُحذف"
                selected={source} onSelect={p => { setSource(p); setConfirm(false); setErr(null); setDone(null); }} />
              <PlayerPicker key={`tgt-${targetKey}`} token={token!} label="الهدف — السجل الصحيح الذي سيبقى"
                selected={target} onSelect={p => { setTarget(p); setConfirm(false); setErr(null); setDone(null); }} />

              {done && (
                <div className="bg-win/10 border border-win/30 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="text-win text-xs flex-1">{done}</span>
                  <button onClick={reset} className="text-hint text-[11px] font-bold">✕</button>
                </div>
              )}
              {err && <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{err}</p>}

              {source && target && (
                <div className="border border-gold/30 bg-gold/5 rounded-xl p-3 space-y-2">
                  <p className="text-gold text-xs font-bold">معاينة الدمج</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="line-through text-hint">{source.name}</span>
                    <span className="text-hint">←</span>
                    <span className="font-bold text-text">{target.name}</span>
                  </div>
                  <p className="text-hint text-[10px]">
                    مواليد {source.birth_year} → مواليد {target.birth_year}
                  </p>
                  {!confirm ? (
                    <button onClick={() => setConfirm(true)}
                      className="bg-gold text-black font-extrabold px-4 py-2 rounded-lg text-sm">
                      دمج
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-loss text-xs flex-1">سيُحذف سجل "{source.name}" نهائيًا بعد نقل جميع إحصاءاته.</span>
                      <button onClick={() => setConfirm(false)} className="text-hint text-xs font-bold px-3 py-2">إلغاء</button>
                      <button onClick={merge} disabled={busy}
                        className="bg-loss text-white font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                        {busy ? '…' : 'تأكيد الدمج'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

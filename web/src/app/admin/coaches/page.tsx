'use client';
import { useState, useCallback, useEffect } from 'react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import AdminShell from '@/components/admin/AdminShell';
import { apiSearchCoaches, apiMergeCoach, apiCoachSummary, type CoachSearchResult, type CoachMergeSummary } from '@/lib/adminApi';

const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";

/** Side-by-side card so the admin can confirm two records are the same person. */
function SummaryCard({ label, danger, sum }: { label: string; danger?: boolean; sum: CoachMergeSummary | null }) {
  return (
    <div className={`rounded-lg border p-2.5 space-y-1.5 ${danger ? 'border-loss/40 bg-loss/5' : 'border-win/40 bg-win/5'}`}>
      <p className={`text-[10px] font-bold ${danger ? 'text-loss' : 'text-win'}`}>{label}</p>
      {!sum ? <p className="text-hint text-[11px]">…</p> : (
        <>
          <p className="text-text text-sm font-bold truncate">{sum.name} <span className="text-hint text-[10px] font-normal">#{sum.id}</span></p>
          {sum.birth_year != null && <p className="text-hint text-[11px]">مواليد {sum.birth_year}</p>}
          <div className="border-t border-bdr/40 pt-1 space-y-0.5">
            {sum.roles.length === 0 ? <p className="text-hint text-[10px]">لا أدوار</p> : sum.roles.map((r, i) => (
              <p key={i} className="text-[10px] text-text truncate">
                <span>{r.type === 'manager' ? '🏢' : '👔'}</span>{' '}
                {r.role ? `${r.role} · ` : ''}{r.club}
                {r.age ? <span className="text-teal"> · {r.age}</span> : ''}
                {r.current && <span className="text-win"> · حالي</span>}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CoachPicker({ token, label, selected, onSelect }: {
  token: string; label: string;
  selected: CoachSearchResult | null;
  onSelect: (c: CoachSearchResult) => void;
}) {
  const [q, setQ] = useState(selected?.name ?? '');
  const [results, setResults] = useState<CoachSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (val: string) => {
    setQ(val);
    if (val.length < 2) { setResults([]); return; }
    setLoading(true);
    try { setResults(await apiSearchCoaches(token, val)); }
    finally { setLoading(false); }
  }, [token]);

  const pick = (c: CoachSearchResult) => {
    setQ(c.name ?? '');
    setResults([]);
    onSelect(c);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-teal text-[11px] font-bold">{label}</label>
      <input value={q} onChange={e => search(e.target.value)}
        placeholder="اكتب اسم المدرّب للبحث…" className={inputCls} />
      {loading && <p className="text-hint text-[11px]">بحث…</p>}
      {results.length > 0 && (
        <ul className="bg-darkBg border border-bdr rounded-lg overflow-hidden">
          {results.map(c => (
            <li key={c.id}>
              <button onClick={() => pick(c)}
                className="w-full text-start px-3 py-2.5 text-sm text-text hover:bg-bdr/40 transition-colors border-b border-bdr/40 last:border-0">
                <span className="font-medium">{c.name}</span>
                {c.role && <span className="text-aqua text-[10px] mr-2">{c.role}</span>}
                {c.club && <span className="text-teal text-[10px] mr-2">{c.club}</span>}
                {c.birth_year != null && <span className="text-hint text-[10px] mr-2">مواليد {c.birth_year}</span>}
                <span className="text-hint text-[10px] mr-1">#{c.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && results.length === 0 && (
        <p className="text-teal text-[11px]">✓ {selected.name}{selected.birth_year != null ? ` (مواليد ${selected.birth_year})` : ''}</p>
      )}
    </div>
  );
}

export default function CoachesPage() {
  const { token, canEdit } = useAdminAuth();
  const [source, setSource] = useState<CoachSearchResult | null>(null);
  const [target, setTarget] = useState<CoachSearchResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sourceKey, setSourceKey] = useState(0);
  const [targetKey, setTargetKey] = useState(0);
  const [srcSum, setSrcSum] = useState<CoachMergeSummary | null>(null);
  const [tgtSum, setTgtSum] = useState<CoachMergeSummary | null>(null);

  // Load each side's roles so the admin can confirm they're the same person.
  useEffect(() => { setSrcSum(null); if (token && source) apiCoachSummary(token, source.id).then(setSrcSum).catch(() => {}); }, [token, source]);
  useEffect(() => { setTgtSum(null); if (token && target) apiCoachSummary(token, target.id).then(setTgtSum).catch(() => {}); }, [token, target]);

  const reset = () => {
    setSource(null); setTarget(null); setConfirm(false);
    setErr(null); setDone(null);
    setSourceKey(k => k + 1); setTargetKey(k => k + 1);
  };

  const merge = async () => {
    if (!token || !source || !target) return;
    setErr(null); setBusy(true);
    try {
      const r = await apiMergeCoach(token, source.id, target.id);
      setDone(`تم دمج "${source.name}" في "${r.target_name}" بنجاح.`);
      setSource(null); setTarget(null); setConfirm(false);
      setSourceKey(k => k + 1); setTargetKey(k => k + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <AdminShell title="المدربون">
      <div className="space-y-4 max-w-lg">
        <div className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 space-y-4">
          <div>
            <p className="text-text font-bold text-sm mb-1">دمج مدرّبَين / أعضاء جهاز</p>
            <p className="text-hint text-[11px] leading-relaxed">
              الشخص الواحد سجلّ واحد يجمع أدواره الفنية مع الفرق وأدواره الإدارية في الأندية.
              عندما يُدخَل الاسم بأكثر من صياغة يتكرّر السجل. هنا يمكن دمج السجل المُكرَّر (المصدر)
              في السجل الصحيح (الهدف): تنتقل كل أدواره (مع الفرق والأندية) إلى سجل الهدف ثم يُحذف
              سجل المصدر نهائيًا.
            </p>
          </div>

          {!canEdit ? (
            <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">
              يتطلب صلاحية محرّر أو مدير عام.
            </p>
          ) : (
            <>
              <CoachPicker key={`src-${sourceKey}`} token={token!} label="المصدر — السجل المُكرَّر الذي سيُحذف"
                selected={source} onSelect={c => { setSource(c); setConfirm(false); setErr(null); setDone(null); }} />
              <CoachPicker key={`tgt-${targetKey}`} token={token!} label="الهدف — السجل الصحيح الذي سيبقى"
                selected={target} onSelect={c => { setTarget(c); setConfirm(false); setErr(null); setDone(null); }} />

              {done && (
                <div className="bg-win/10 border border-win/30 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="text-win text-xs flex-1">{done}</span>
                  <button onClick={reset} className="text-hint text-[11px] font-bold">✕</button>
                </div>
              )}
              {err && <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{err}</p>}

              {source && target && (
                <div className="border border-gold/30 bg-gold/5 rounded-xl p-3 space-y-2">
                  <p className="text-gold text-xs font-bold">معاينة الدمج — تأكّد أنهما نفس الشخص</p>
                  <div className="grid grid-cols-2 gap-2">
                    <SummaryCard label="المصدر — سيُحذف" danger sum={srcSum} />
                    <SummaryCard label="الهدف — سيبقى" sum={tgtSum} />
                  </div>
                  {srcSum && tgtSum && srcSum.birth_year != null && tgtSum.birth_year != null && srcSum.birth_year !== tgtSum.birth_year && (
                    <p className="text-gold text-[10px] bg-gold/10 border border-gold/30 rounded px-2 py-1">
                      ⚠️ سنتا الميلاد مختلفتان ({srcSum.birth_year} ≠ {tgtSum.birth_year}) — تأكّد أنهما نفس الشخص.
                    </p>
                  )}
                  {!confirm ? (
                    <button onClick={() => setConfirm(true)}
                      className="bg-gold text-black font-extrabold px-4 py-2 rounded-lg text-sm">
                      دمج
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-loss text-xs flex-1">سيُحذف سجل "{source.name}" نهائيًا بعد نقل جميع أدواره.</span>
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

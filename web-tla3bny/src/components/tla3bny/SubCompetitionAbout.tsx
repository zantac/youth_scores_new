'use client';
import { useState } from 'react';
import { tRequestJoin, type TCompAge } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import { formatMatchDate } from '@/lib/utils';
import { Card, ErrorNote, LogoAvatar, PrimaryButton, useName, useTT } from './kit';

/**
 * The public "about this sub-competition" page: everything the organizer entered
 * when creating this bracket — its description, match rules and required papers.
 *
 * The per-team subscription fee is the one exception: the API only sends it to
 * academies and the competition's admins, so `age.subscription_fee` is simply
 * absent for the anonymous public and the fee card never renders for them.
 */
export default function SubCompetitionAbout({ age }: { age: TCompAge }) {
  const tt = useTT();
  const { locale } = useApp();

  const deadline = age.player_registration_deadline
    ? formatMatchDate(age.player_registration_deadline, locale)
    : null;

  // Every rule the organizer set for this sub-competition.
  const facts: [string, string | null][] = [
    [tt('آخر موعد للتسجيل', 'Registration deadline'), deadline],
    [tt('قائمة الفريق', 'Squad list'), String(age.max_players_per_team)],
    [tt('التشكيلة', 'Lineup'), String(age.lineup_size)],
    [tt('الأساسيون', 'On pitch'), String(age.players_on_pitch)],
    [tt('البدلاء', 'Substitutes'), String(age.max_substitutes)],
    [tt('الأشواط', 'Periods'), String(age.num_periods)],
    [tt('دقائق الشوط', 'Period minutes'), String(age.period_minutes)],
    [tt('مهلة التشكيلة (دقيقة)', 'Lineup deadline (min)'), String(age.lineup_deadline_minutes)],
    [
      tt('نافذة الاستبدال', 'Replacement window'),
      age.replacements_open
        ? tt(`مفتوحة · حتى ${age.max_replacements}`, `Open · up to ${age.max_replacements}`)
        : tt('مغلقة', 'Closed'),
    ],
    [
      tt('إرسال التشكيلة (الخطة)', 'Formation required'),
      age.formation_required ? tt('مطلوب', 'Required') : tt('غير مطلوب', 'Not required'),
    ],
  ];
  const shown = facts.filter(([, v]) => v);

  return (
    <div className="space-y-4">
      {age.description && (
        <Card className="p-4 space-y-2">
          <h3 className="font-black text-text">{tt('عن المنافسة', 'About this competition')}</h3>
          <p className="text-sm text-teal whitespace-pre-line leading-relaxed">{age.description}</p>
        </Card>
      )}

      <SubscriptionSection age={age} />

      {shown.length > 0 && (
        <Card className="p-4">
          <h3 className="font-black text-text mb-3">{tt('قوانين المنافسة', 'Competition rules')}</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {shown.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-b border-bdr/40 pb-2">
                <dt className="text-teal text-xs font-bold shrink-0">{label}</dt>
                <dd className="text-text text-sm text-end tnum">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {age.required_documents.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="font-black text-text">{tt('أوراق تسجيل اللاعب', 'Player registration papers')}</h3>
          <p className="text-hint text-[11px]">
            {tt(
              'كل لاعب في هذه المنافسة لازم يرفع الأوراق دي عشان يتم اعتماده.',
              'Every player in this competition must upload these to be approved.',
            )}
          </p>
          <ul className="space-y-1.5">
            {age.required_documents.map(d => (
              <li key={d} className="flex items-center gap-2 text-sm text-teal">
                <span className="text-aqua">📄</span>{d}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * The subscription card — shown to academies and admins (the fee is only sent to
 * them). It carries the per-team fee and, for an academy account, the button to
 * request to join: the academy picks which of its teams to enter, and only teams
 * matching this sub-competition's age can (the backend enforces the same rule).
 */
function SubscriptionSection({ age }: { age: TCompAge }) {
  const tt = useTT();
  const nm = useName();
  const { isActiveAcademy, academy, token } = useTla3bnyAuth();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const feeSet = age.subscription_fee != null;
  const canJoin = isActiveAcademy && !!token;
  // Only the academy's teams in this sub-competition's age group may enter.
  const eligibleTeams = (academy?.teams ?? []).filter(t => t.age_category_id === age.age_category_id);

  // Nothing for this viewer (not an academy and no fee visible) → render nothing.
  if (!feeSet && !canJoin) return null;

  const submit = async (teamId: number) => {
    if (!token) return;
    setBusy(teamId); setErr(null);
    try {
      await tRequestJoin(token, teamId, age.id);
      setDone(true); setPicking(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <Card className="p-4 space-y-3 border-aqua/30 bg-aqua/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-aqua font-bold text-sm">💳 {tt('الاشتراك', 'Subscription')}</p>
          <p className="text-hint text-[11px] mt-0.5">{tt('تظهر للأكاديميات فقط', 'Visible to academies only')}</p>
        </div>
        {feeSet && (
          <span className="text-text font-black text-lg tnum whitespace-nowrap">
            {age.subscription_fee!.toLocaleString('en-US')} {tt('ج.م / لكل فريق', 'EGP / team')}
          </span>
        )}
      </div>

      {canJoin && (
        done ? (
          <p className="text-win text-sm font-bold flex items-center gap-1">
            ✓ {tt('تم إرسال طلب الاشتراك، في انتظار موافقة المنظم', 'Request sent — awaiting the organizer’s approval')}
          </p>
        ) : !picking ? (
          <PrimaryButton onClick={() => { setErr(null); setPicking(true); }} className="w-full text-sm">
            {tt('طلب الاشتراك', 'Request to join')}
          </PrimaryButton>
        ) : eligibleTeams.length === 0 ? (
          <p className="text-hint text-xs">
            {tt(
              'لا يوجد لديك فريق في هذه الفئة العمرية. أنشئ فريقًا أولًا من لوحة التحكم.',
              'You have no team in this age group. Create one first from your dashboard.',
            )}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-teal text-xs font-bold">{tt('اختر الفريق المشترك', 'Choose the team to enter')}</p>
            {eligibleTeams.map(t => (
              <button key={t.id} onClick={() => submit(t.id)} disabled={busy != null}
                className="w-full text-start flex items-center gap-3 bg-darkBg border border-bdr rounded-xl px-3 py-2.5 hover:border-aqua/50 transition-colors disabled:opacity-50">
                <LogoAvatar src={t.photo_path ?? t.academy_logo} name={nm(t.display_name, t.display_name_en)} size={30} />
                <span className="flex-1 min-w-0">
                  <span className="block text-text font-bold text-sm truncate">{nm(t.display_name, t.display_name_en)}</span>
                  <span className="block text-hint text-[11px]">{t.age_category}</span>
                </span>
                {busy === t.id
                  ? <span className="text-hint text-xs">…</span>
                  : <span className="text-aqua text-lg leading-none">＋</span>}
              </button>
            ))}
            <button onClick={() => setPicking(false)} className="text-hint text-xs hover:text-text">
              {tt('إلغاء', 'Cancel')}
            </button>
          </div>
        )
      )}

      {err && <ErrorNote>{err}</ErrorNote>}
    </Card>
  );
}

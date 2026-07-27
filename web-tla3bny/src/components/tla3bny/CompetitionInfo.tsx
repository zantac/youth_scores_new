'use client';
import { whatsappLink, type TCompetition } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import { formatMatchDate } from '@/lib/utils';
import { Card, EmptyState, useTT } from './kit';

/**
 * The public "about this competition" page: what it is, who runs it, when and
 * where it runs, which papers a player needs — and the buttons to reach the
 * organiser, WhatsApp chat first, which is how these are actually arranged.
 */
export default function CompetitionInfo({ comp }: { comp: TCompetition }) {
  const tt = useTT();
  const { locale } = useApp();

  const chat = whatsappLink(
    comp.whatsapp_number,
    tt(`السلام عليكم، بخصوص بطولة ${comp.name}`, `Hello, about ${comp.name}`),
  );

  const dates = [comp.start_date, comp.end_date].filter(Boolean) as string[];
  const period = dates.length
    ? dates.map(d => formatMatchDate(d, locale)).join(tt(' حتى ', ' — '))
    : null;

  const facts: [string, string | null][] = [
    [tt('المنظم', 'Organizer'), comp.organizer_name],
    [tt('الموسم', 'Season'), comp.season_name],
    [tt('المكان', 'Location'), comp.location],
    [tt('الفترة', 'Dates'), period],
    [tt('الأعمار', 'Ages'), (comp.ages ?? []).map(a => a.age_category).join(' · ') || null],
  ];
  const shown = facts.filter(([, v]) => v);

  const nothingToShow =
    !comp.info && !comp.description && shown.length === 0 && !chat &&
    !comp.contact_phone && !comp.facebook_url && !comp.whatsapp_group_url;

  if (nothingToShow) {
    return <EmptyState icon="ℹ️" text={tt('لم تُضف معلومات عن البطولة بعد', 'No information added yet')} />;
  }

  return (
    <div className="space-y-4">
      {/* Contact — the reason most people open this page. */}
      {(chat || comp.whatsapp_group_url || comp.contact_phone || comp.facebook_url) && (
        <div className="flex flex-wrap gap-2">
          {chat && (
            <a href={chat} target="_blank" rel="noopener noreferrer"
              className="flex-1 min-w-[160px] flex items-center justify-center gap-2 bg-[#25D366] text-white font-extrabold py-3 px-4 rounded-xl shadow-[0_10px_24px_-12px_#25D366] active:opacity-85 transition-opacity">
              <span className="text-lg">💬</span>
              {tt('تواصل واتساب', 'Chat on WhatsApp')}
            </a>
          )}
          {comp.whatsapp_group_url && (
            <a href={comp.whatsapp_group_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 min-w-[160px] flex items-center justify-center gap-2 border border-[#25D366]/50 text-[#25D366] font-bold py-3 px-4 rounded-xl active:bg-[#25D366]/10 transition-colors">
              <span className="text-lg">👥</span>
              {tt('جروب البطولة', 'Competition group')}
            </a>
          )}
          {comp.contact_phone && (
            <a href={`tel:${comp.contact_phone.replace(/\s/g, '')}`}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-cardBg2 border border-bdr text-teal font-bold py-3 px-4 rounded-xl active:bg-aqua/10 transition-colors">
              <span>📞</span><span dir="ltr">{comp.contact_phone}</span>
            </a>
          )}
          {comp.facebook_url && (
            <a href={comp.facebook_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-cardBg2 border border-bdr text-teal font-bold py-3 px-4 rounded-xl active:bg-aqua/10 transition-colors">
              <span>📘</span>{tt('فيسبوك', 'Facebook')}
            </a>
          )}
        </div>
      )}

      {(comp.info || comp.description) && (
        <Card className="p-4 space-y-2">
          <h3 className="font-black text-text">{tt('عن البطولة', 'About the competition')}</h3>
          {comp.description && <p className="text-sm text-teal">{comp.description}</p>}
          {comp.info && <p className="text-sm text-hint whitespace-pre-line leading-relaxed">{comp.info}</p>}
        </Card>
      )}

      {shown.length > 0 && (
        <Card className="p-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {shown.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-b border-bdr/40 pb-2">
                <dt className="text-teal text-xs font-bold shrink-0">{label}</dt>
                <dd className="text-text text-sm text-end">{value}</dd>
              </div>
            ))}
          </dl>
          {comp.location_url && (
            <a href={comp.location_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-aqua text-xs font-bold mt-3">
              🗺️ {tt('فتح الموقع على الخريطة', 'Open location on the map')}
            </a>
          )}
        </Card>
      )}

      {comp.required_documents.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="font-black text-text">{tt('أوراق تسجيل اللاعب', 'Player registration papers')}</h3>
          <p className="text-hint text-[11px]">
            {tt(
              'كل لاعب في هذه البطولة لازم يرفع الأوراق دي عشان يتم اعتماده.',
              'Every player entered in this competition must upload these to be approved.',
            )}
          </p>
          <ul className="space-y-1.5">
            {comp.required_documents.map(d => (
              <li key={d} className="flex items-center gap-2 text-sm text-teal">
                <span className="text-aqua">📄</span>{d}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-3 flex items-center gap-2 text-xs">
        <span>{comp.registration_open ? '✅' : '🔒'}</span>
        <span className={comp.registration_open ? 'text-win font-bold' : 'text-hint font-bold'}>
          {comp.registration_open
            ? tt('التسجيل مفتوح', 'Registration is open')
            : tt('التسجيل مغلق', 'Registration is closed')}
        </span>
      </Card>
    </div>
  );
}

'use client';
import { whatsappLink, type TCompetition } from '@/lib/tla3bnyApi';
import { useApp } from '@/context/AppContext';
import { formatMatchDate, sortAges, subCompLabel } from '@/lib/utils';
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
    [tt('البطولات الفرعية', 'Sub-competitions'), sortAges(comp.ages ?? []).map(subCompLabel).join(' · ') || null],
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
        <div className="flex gap-3">
          {chat && (
            <a href={chat} target="_blank" rel="noopener noreferrer" title={tt('تواصل واتساب', 'Chat on WhatsApp')}
              className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#25D366] shadow-[0_8px_20px_-8px_#25D366] active:opacity-80 transition-opacity text-xl">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.528 5.847L.057 23.944l6.254-1.641A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.88 0-3.63-.494-5.147-1.357l-.369-.218-3.712.974.99-3.617-.24-.381A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            </a>
          )}
          {comp.whatsapp_group_url && (
            <a href={comp.whatsapp_group_url} target="_blank" rel="noopener noreferrer" title={tt('جروب البطولة', 'Competition group')}
              className="w-12 h-12 rounded-xl flex items-center justify-center border border-[#25D366]/60 text-[#25D366] active:bg-[#25D366]/10 transition-colors text-xl">
              👥
            </a>
          )}
          {comp.contact_phone && (
            <a href={`tel:${comp.contact_phone.replace(/\s/g, '')}`} title={comp.contact_phone}
              className="w-12 h-12 rounded-xl flex items-center justify-center bg-cardBg2 border border-bdr text-teal active:bg-aqua/10 transition-colors text-xl">
              📞
            </a>
          )}
          {comp.facebook_url && (
            <a href={comp.facebook_url} target="_blank" rel="noopener noreferrer" title="Facebook"
              className="w-12 h-12 rounded-xl flex items-center justify-center active:opacity-80 transition-opacity"
              style={{ background: '#1877F2' }}>
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
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

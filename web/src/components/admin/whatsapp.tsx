// Admin-only WhatsApp contact helpers, shared by the team roster/coach forms
// and the club-staff form. The phone lives on the Player/Coach person record and
// is never shown on any public page — these render only inside /admin.

const inputCls = "w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua";

export const WA_DEFAULT_CC = '20';

// Country calling codes for the phone field. Egypt leads (the default); the rest
// cover where our academies' players tend to come from. Codes are digits only.
// (Windows renders the flag emoji as the 2-letter country code, which is fine.)
const COUNTRY_CODES = [
  { code: '20', flag: '🇪🇬' },
  { code: '966', flag: '🇸🇦' },
  { code: '971', flag: '🇦🇪' },
  { code: '965', flag: '🇰🇼' },
  { code: '974', flag: '🇶🇦' },
  { code: '973', flag: '🇧🇭' },
  { code: '968', flag: '🇴🇲' },
  { code: '962', flag: '🇯🇴' },
  { code: '970', flag: '🇵🇸' },
  { code: '963', flag: '🇸🇾' },
  { code: '964', flag: '🇮🇶' },
  { code: '961', flag: '🇱🇧' },
  { code: '249', flag: '🇸🇩' },
  { code: '218', flag: '🇱🇾' },
  { code: '212', flag: '🇲🇦' },
  { code: '213', flag: '🇩🇿' },
  { code: '216', flag: '🇹🇳' },
] as const;

// Build a wa.me link from a country code + local number. Drops the national
// trunk "0" (Egyptians write 010…; WhatsApp wants 2010…) and any non-digits.
// Returns null when there's no number to dial. Tapping the link on a phone with
// two WhatsApp apps installed makes the OS ask which one to open the chat with.
export function waLink(cc: string | null | undefined, phone: string | null | undefined): string | null {
  const c = (cc || '').replace(/\D/g, '') || WA_DEFAULT_CC;
  const p = (phone || '').replace(/\D/g, '').replace(/^0+/, '');
  return p ? `https://wa.me/${c}${p}` : null;
}

function WaIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.29-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.4-1.48-.89-.79-1.49-1.77-1.66-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.29-1.04 1.01-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.09 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.56-.35zM12.04 2.5c-5.24 0-9.5 4.25-9.5 9.49 0 1.67.44 3.3 1.28 4.74L2.5 21.5l4.9-1.28a9.46 9.46 0 004.63 1.18h.01c5.24 0 9.49-4.25 9.5-9.49a9.42 9.42 0 00-2.78-6.71A9.42 9.42 0 0012.04 2.5z"/>
    </svg>
  );
}

/** Green WhatsApp launcher for a roster/staff row. Renders nothing when there's
 *  no number. Stops row-level clicks so it never triggers the row's edit. */
export function WaLaunch({ cc, phone }: { cc: string | null; phone: string | null }) {
  const href = waLink(cc, phone);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      title="محادثة واتساب" aria-label="محادثة واتساب"
      className="text-[#25D366] flex-shrink-0 hover:opacity-80 transition-opacity">
      <WaIcon />
    </a>
  );
}

/** A compact country-code select + a wide local-number input. The WhatsApp
 *  launcher is NOT here — it lives on the row (beside status/edit/delete). */
export function PhoneField({ code, phone, onCode, onPhone }: {
  code: string; phone: string; onCode: (v: string) => void; onPhone: (v: string) => void;
}) {
  return (
    <div className="col-span-2">
      <label className="block text-teal text-[11px] font-bold mb-1">📱 رقم الهاتف (واتساب)</label>
      <div className="flex gap-2" dir="ltr">
        <select value={code || WA_DEFAULT_CC} onChange={e => onCode(e.target.value)}
          className={inputCls + ' w-24 flex-shrink-0 px-2'}>
          {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}
        </select>
        <input value={phone} onChange={e => onPhone(e.target.value)} inputMode="tel"
          placeholder="01012345678" className={inputCls + ' flex-1'} />
      </div>
    </div>
  );
}

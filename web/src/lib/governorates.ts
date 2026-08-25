// Egypt's 27 governorates (Arabic + English), for the admin "club city" picker:
// the Arabic field suggests these, and selecting one auto-fills the English name.
export const EGYPT_GOVERNORATES: { ar: string; en: string }[] = [
  { ar: 'القاهرة', en: 'Cairo' },
  { ar: 'الجيزة', en: 'Giza' },
  { ar: 'الإسكندرية', en: 'Alexandria' },
  { ar: 'الدقهلية', en: 'Dakahlia' },
  { ar: 'الشرقية', en: 'Sharqia' },
  { ar: 'القليوبية', en: 'Qalyubia' },
  { ar: 'كفر الشيخ', en: 'Kafr El Sheikh' },
  { ar: 'الغربية', en: 'Gharbia' },
  { ar: 'المنوفية', en: 'Monufia' },
  { ar: 'البحيرة', en: 'Beheira' },
  { ar: 'الإسماعيلية', en: 'Ismailia' },
  { ar: 'بورسعيد', en: 'Port Said' },
  { ar: 'السويس', en: 'Suez' },
  { ar: 'دمياط', en: 'Damietta' },
  { ar: 'الفيوم', en: 'Faiyum' },
  { ar: 'بني سويف', en: 'Beni Suef' },
  { ar: 'المنيا', en: 'Minya' },
  { ar: 'أسيوط', en: 'Asyut' },
  { ar: 'سوهاج', en: 'Sohag' },
  { ar: 'قنا', en: 'Qena' },
  { ar: 'الأقصر', en: 'Luxor' },
  { ar: 'أسوان', en: 'Aswan' },
  { ar: 'البحر الأحمر', en: 'Red Sea' },
  { ar: 'الوادي الجديد', en: 'New Valley' },
  { ar: 'مطروح', en: 'Matrouh' },
  { ar: 'شمال سيناء', en: 'North Sinai' },
  { ar: 'جنوب سيناء', en: 'South Sinai' },
];

// Fold Arabic so a match ignores tashkeel/tatweel and alef/ya/ta spelling.
const foldAr = (s: string) => s
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ').trim();

/** The English name for a governorate given its Arabic name, or null if the
 *  Arabic text isn't one of the governorates (a custom city). */
export function governorateEn(ar: string): string | null {
  const key = foldAr(ar);
  if (!key) return null;
  const g = EGYPT_GOVERNORATES.find(x => foldAr(x.ar) === key);
  return g ? g.en : null;
}

'use client';
import { useRouter } from 'next/navigation';

interface Props {
  title: string;
  back?: boolean;
  actions?: React.ReactNode;
  // When placed inside an already-sticky header stack, drop the self-sticky so
  // it does not fight the wrapper (the wrapper is what pins to the top).
  embedded?: boolean;
}

export default function AppBar({ title, back, actions, embedded }: Props) {
  const router = useRouter();
  // Pins below the global banner header (published as --header-h) rather than at
  // the very top, so the banner stays visible above the page title.
  return (
    <header className={`${embedded ? '' : 'sticky top-[var(--header-h,0px)] z-40'} bg-cardBg border-b border-bdr flex items-center px-4 py-3 gap-3 safe-top`}>
      {back && (
        <button onClick={() => router.back()} className="text-aqua text-xl">‹</button>
      )}
      <h1 className="flex-1 text-aqua font-bold text-base truncate">{title}</h1>
      {actions}
    </header>
  );
}

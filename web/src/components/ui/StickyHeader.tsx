'use client';
import { useEffect, useRef } from 'react';
import ControlsBar from './ControlsBar';

const BANNER =
  'https://res.cloudinary.com/debq5s4sn/image/upload/v1783684931/youthscores-banner-v2_yqr3hs.png';

// Banner + the search/theme/language row, pinned together at the top of every
// page so the branding and controls stay on screen while everything scrolls
// beneath them. Its height is published as --header-h so each page's own sticky
// header (title bar, tabs) can pin directly underneath instead of colliding with
// the banner, and the home feed's anchored scroll (jump-to-today) can clear it.
export default function StickyHeader() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) return;
    const set = () => root.style.setProperty('--header-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--header-h'); };
  }, []);

  return (
    <header ref={ref} className="sticky top-0 z-40 bg-dark">
      {/* Held to the same width as the bottom nav and the page content. Left
          full-width it stretched across a desktop viewport while everything
          below it stayed in a phone-width column. */}
      <div className="w-full max-w-lg mx-auto">
        <img src={BANNER} alt="Youth Scores" className="w-full h-auto" />
      </div>
      <ControlsBar />
    </header>
  );
}

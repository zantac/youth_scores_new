'use client';
import { useState, useEffect } from 'react';
import { apiAdImpression, apiAdClick } from '@/lib/api';
import { safeUrl, cloudinaryUrl } from '@/lib/utils';
import type { AdItem } from '@/lib/types';

interface Props {
  ad: AdItem;
  onClose: () => void;
}

export default function AdInterstitial({ ad, onClose }: Props) {
  const [countdown, setCountdown] = useState(5);
  const [canClose, setCanClose]   = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { clearInterval(id); setCanClose(true); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // One impression per shown ad.
  useEffect(() => { apiAdImpression(ad.id, 'interstitial'); }, [ad.id]);
  const click = () => apiAdClick(ad.id, 'interstitial');

  const hasImage = !!ad.image?.startsWith('http');
  // Scheme-check every admin-supplied URL before it reaches an href.
  const link = safeUrl(ad.link);
  const fbLink = safeUrl(ad.facebook_link);
  const ytLink = safeUrl(ad.youtube_video);
  const locLink = safeUrl(ad.location_url);
  const hasActions = !!(ad.whatsapp_number || ad.mobile_number || fbLink || ytLink || locLink);

  return (
    <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center">

      {/* Fullscreen image or placeholder — the whole ad taps through to `link`. */}
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={click}
          className="absolute inset-0 block">
          {hasImage
            ? <img src={cloudinaryUrl(ad.image, 1200)} alt={ad.name} className="w-full h-full object-contain" />
            : <div className="w-full h-full bg-darkBg flex flex-col items-center justify-center gap-4 select-none">
                <span className="text-8xl">📢</span>
                <p className="text-teal text-base">إعلان · Advertisement</p>
              </div>}
        </a>
      ) : hasImage ? (
        <img src={cloudinaryUrl(ad.image, 1200)} alt={ad.name} className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="absolute inset-0 bg-darkBg flex flex-col items-center justify-center gap-4 select-none">
          <span className="text-8xl">📢</span>
          <p className="text-teal text-base">إعلان · Advertisement</p>
        </div>
      )}

      {/* Bottom gradient — action buttons only. The ad name is an internal
          admin label and is not shown to users. */}
      {hasActions && (
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-5 pb-10 pt-16">
        <div className="flex flex-wrap gap-2">
          {ad.whatsapp_number && (
            <a href={`https://wa.me/${String(ad.whatsapp_number).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={click}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#25D366]/60 bg-[#25D366]/20 text-[#25D366] text-xs font-semibold">
              💬 WhatsApp
            </a>
          )}
          {ad.mobile_number && (
            <a href={`tel:${String(ad.mobile_number).replace(/[^\d+]/g, '')}`} onClick={click}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal/60 bg-teal/20 text-teal text-xs font-semibold">
              📞 اتصال
            </a>
          )}
          {fbLink && (
            <a href={fbLink} target="_blank" rel="noopener noreferrer" onClick={click}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1877F2]/60 bg-[#1877F2]/20 text-[#1877F2] text-xs font-semibold">
              📘 Facebook
            </a>
          )}
          {ytLink && (
            <a href={ytLink} target="_blank" rel="noopener noreferrer" onClick={click}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/60 bg-red-500/20 text-red-400 text-xs font-semibold">
              ▶ YouTube
            </a>
          )}
          {locLink && (
            <a href={locLink} target="_blank" rel="noopener noreferrer" onClick={click}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/20 bg-white/10 text-white/70 text-xs font-semibold">
              📍 الموقع
            </a>
          )}
        </div>
      </div>
      )}

      {/* Top-right: pulsing countdown → close button */}
      <div className="absolute top-4 right-4">
        {canClose ? (
          <button onClick={onClose}
            className="w-11 h-11 rounded-full bg-black/70 border border-white/70 flex items-center justify-center text-white text-lg font-bold active:scale-95 transition-transform">
            ✕
          </button>
        ) : (
          <div className="w-11 h-11 rounded-full bg-black/70 border border-white/40 flex items-center justify-center text-white font-bold text-lg animate-pulse select-none">
            {countdown}
          </div>
        )}
      </div>
    </div>
  );
}

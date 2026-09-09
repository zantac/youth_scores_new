'use client';
import { useEffect } from 'react';
import { isChunkLoadError, reloadForChunkError } from '@/lib/chunkReload';

// Mounted once in the root layout. Listens for the chunk-load failures that occur
// when a tab running a pre-deploy build navigates/prefetches after a new build has
// shipped, and reloads the current page so it picks up the new build — instead of
// letting the App Router hard-navigate the user onto the raw …/index.txt payload.
// See src/lib/chunkReload.ts for the full rationale. Renders nothing.
export default function ChunkReloadGuard() {
  useEffect(() => {
    // Dynamic import() rejections (Next's prefetch/navigation path) surface here.
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkLoadError(e.reason)) reloadForChunkError();
    };
    // A failed <script>/chunk during render surfaces as a window error event.
    const onError = (e: ErrorEvent) => {
      if (isChunkLoadError(e.error) || isChunkLoadError(e)) reloadForChunkError();
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);
  return null;
}

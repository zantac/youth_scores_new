'use client';
import { useEffect } from 'react';

// Client-side error monitoring. Inert until NEXT_PUBLIC_SENTRY_DSN is set (build
// it into the export, or set it in the environment) — so this ships safely with
// no DSN and starts reporting the moment one is provided, no code change needed.
//
// @sentry/react (the plain browser SDK, not @sentry/nextjs) is used deliberately:
// output:'export' has no server to instrument, and this avoids the webpack-plugin
// integration that bit us with next-pwa under Turbopack. Dynamically imported in
// an effect so the SDK is code-split and never touches the Node prerender.
export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    let cancelled = false;
    import('@sentry/react')
      .then((Sentry) => {
        if (cancelled) return;
        Sentry.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? 'production',
          // Errors only by default; opt into perf tracing via the env var.
          tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES ?? 0),
        });
      })
      .catch(() => {/* monitoring must never break the app */});
    return () => { cancelled = true; };
  }, []);
  return null;
}

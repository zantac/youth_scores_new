/* Firebase Cloud Messaging service worker for tla3bny. Shows pushes when the
   site is not focused, and deep-links on click. Same Firebase project as
   youthscores (shared backend), but the backend sends to tla3bny-namespaced
   topics (t3_*), so this only receives tla3bny pushes. Config below is public by
   design (it also ships in the client bundle). */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDzi2sIqqjoRnJ4WHO_NvUK2plmR7oxoos',
  authDomain: 'youthscores.firebaseapp.com',
  projectId: 'youthscores',
  storageBucket: 'youthscores.firebasestorage.app',
  messagingSenderId: '492562642059',
  appId: '1:492562642059:web:153bd79e686fd76c31508e',
});

// Take control as soon as a new version is fetched so an old worker never fires
// duplicate notifications alongside the new one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

// A stable tag per message so duplicate deliveries (multiple tabs, or SW +
// foreground) collapse into ONE notification instead of stacking.
function notifTag(data) {
  return `${data.type || 'msg'}:${data.id || data.url || data.title || ''}`;
}

// Data-only messages: title/body/url all live in `data` so exactly one
// notification shows (a top-level notification block would double it on web).
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'تلاعبني', {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    dir: 'rtl',
    lang: 'ar',
    tag: notifTag(data),
    data: { url: data.url || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          if ('navigate' in w) { try { w.navigate(url); } catch (e) {} }
          return w.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

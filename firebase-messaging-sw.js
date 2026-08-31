/* Firebase Cloud Messaging service worker — shows pushes when the site is not
   focused (closed tab / background). It is registered under a private scope
   (see lib/notifications.ts) so it never clashes with the next-pwa "workbox"
   worker that owns "/". The config below is public by design: the same values
   ship in the client bundle, and FCM auth is the VAPID key + server key, not
   these ids. Keep it in sync with lib/notifications.ts. */
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

// Take control as soon as a new version is fetched, instead of waiting for every
// tab to close — otherwise an old SW keeps handling pushes and its notifications
// (e.g. without the dedupe tag below) collide with the new one's.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

// A stable id per message so duplicate deliveries collapse into ONE notification
// instead of stacking. Duplicates happen when several tabs are open (the SDK
// delivers a foreground message to each) or when the SW and a foreground tab both
// react. Same tag => the OS replaces rather than adds.
function notifTag(data) {
  return `${data.type || 'msg'}:${data.id || data.url || data.title || ''}`;
}

// Background handler: the backend sends DATA-ONLY messages (title/body/url all in
// `data`) so exactly one notification shows — a top-level `notification` block
// would make the browser auto-display a second, duplicate one. We draw it here,
// controlling the icon and the click target.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'Youth Scores', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: notifTag(data),
    data: { url: data.url || '/' },
  });
});

// Tapping the notification focuses an open tab (navigating it to the deep link)
// or opens a new one.
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

// NutriFlow Service Worker
// Strategy overview:
//  - App shell (HTML/CSS/JS/icons/manifest): stale-while-revalidate, so the app
//    still boots instantly offline, but quietly updates itself in the background.
//  - Navigations: network-first, so users get the newest shell when online, with
//    an offline fallback chain (cached shell -> offline.html) when they are not.
//  - Open Food Facts API calls: network-first with a runtime cache, so a food
//    that was searched or scanned once is available again offline later - on
//    top of the app's own manual "Save Offline" library.
//  - Google Fonts / Lucide icon CDN: stale-while-revalidate, so the UI keeps its
//    fonts and icons even without a connection after the first successful load.

const SW_VERSION = "v1";
const APP_SHELL_CACHE = `nutriflow-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `nutriflow-runtime-${SW_VERSION}`;
const API_CACHE = `nutriflow-api-${SW_VERSION}`;
const CURRENT_CACHES = [APP_SHELL_CACHE, RUNTIME_CACHE, API_CACHE];

const SHELL_URL = "./index.html";
const OFFLINE_URL = "./offline.html";

const APP_SHELL_ASSETS = [
  SHELL_URL,
  OFFLINE_URL,
  "./manifest.json",
  "./asset/css/style.css",
  "./asset/js/script.js",
  "./asset/icons/icon-192.png",
  "./asset/icons/icon-512.png",
  "./asset/icons/icon-maskable-192.png",
  "./asset/icons/icon-maskable-512.png",
  "./asset/icons/apple-touch-icon.png",
  "./asset/icons/favicon-32.png",
  "./asset/icons/favicon-16.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isOpenFoodFactsRequest(url) {
  return url.hostname.endsWith("openfoodfacts.org");
}

function isCDNAsset(url) {
  return (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "unpkg.com"
  );
}

// Network-first: freshest data wins, cache is only a fallback for when offline.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Stale-while-revalidate: instant response from cache, refreshed in the background.
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request);
    const networkFetch = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);
    return cached || (await networkFetch) || Response.error();
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Page navigations (address bar, home-screen launch, shortcuts with ?view=...)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(APP_SHELL_CACHE);
          return (await cache.match(SHELL_URL)) || (await cache.match(OFFLINE_URL));
        })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
    return;
  }

  if (isOpenFoodFactsRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (isCDNAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

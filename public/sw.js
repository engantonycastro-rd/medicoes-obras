const CACHE_NAME = 'rd-apontamentos-v1'
const OFFLINE_URLS = ['/app', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Skip non-GET and API/supabase requests
  if (request.method !== 'GET') return
  if (request.url.includes('supabase') || request.url.includes('/rest/') || request.url.includes('/storage/')) return

  event.respondWith(
    caches.match(request).then(cached => {
      const fetched = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      }).catch(() => cached || new Response('Offline', { status: 503 }))
      return cached || fetched
    })
  )
})

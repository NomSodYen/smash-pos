/* Service worker ของ POS สแมชเบอร์เกอร์: ทำให้เปิดแอปได้แม้อินเทอร์เน็ตหลุด */
var CACHE = 'smash-pos-v9';
var CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap';

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    var c = await caches.open(CACHE);
    await c.add('./');                                   // หน้าแอป: ต้องสำเร็จ
    await Promise.all(CORE.slice(1).map(function (u) { return c.add(u).catch(function () {}); }));
    try {                                                // ฟอนต์: ทำเท่าที่ทำได้ ไม่สำเร็จก็ไม่เป็นไร
      var r = await fetch(FONT_CSS);
      if (r.ok) {
        var css = await r.clone().text();
        await c.put(FONT_CSS, r);
        var urls = css.match(/https:\/\/fonts\.gstatic\.com[^)'"\s]+/g) || [];
        await Promise.all(urls.map(function (u) { return c.add(u).catch(function () {}); }));
      }
    } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k.indexOf('smash-pos-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function withTimeout(p, ms) {
  return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
}

async function pageRequest(req) {
  var c = await caches.open(CACHE);
  var net = fetch(req);
  try {
    var r = await withTimeout(net, 4000);              // ออนไลน์: ใช้ของใหม่เสมอ (อัปเดตแล้วเห็นทันที)
    if (r && r.ok) {
      c.put('./', r.clone());
      c.put('index.html', r.clone());
    }
    return r;
  } catch (err) {                                      // ออฟไลน์/เน็ตช้า: ใช้ของที่เก็บไว้
    var cached = (await c.match(req, { ignoreSearch: true })) || (await c.match('./')) || (await c.match('index.html'));
    return cached || net;
  }
}

async function assetRequest(req) {
  var c = await caches.open(CACHE);
  var hit = await c.match(req);
  if (hit) return hit;
  var r = await fetch(req);
  if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(pageRequest(req)); return; }
  if (url.origin === location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(assetRequest(req));
  }
});

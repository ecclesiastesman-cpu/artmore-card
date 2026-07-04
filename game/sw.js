// Service Worker: полный прекэш — игра работает без сети после первого открытия.
const VERSION = 'lastcandle-v1';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './src/main.js', './src/core.js', './src/data.js', './src/strings.js', './src/items.js',
  './src/world.js', './src/entities.js', './src/skills.js', './src/render.js', './src/ui.js',
  './src/audio.js', './src/save.js',
];
const ASSETS = [
  'hero_barbarian', 'hero_huntress', 'hero_mage', 'hero_warlock', 'hero_druid', 'form_wolf', 'form_bear',
  'mob_skeleton', 'mob_zombie', 'mob_ghoul', 'mob_bloater', 'mob_cultist', 'mob_hound', 'mob_imp', 'mob_knight',
  'boss_bone', 'boss_plague', 'boss_executioner', 'boss_abyss',
  'wpn_axe', 'wpn_greatsword', 'wpn_bow', 'wpn_staff', 'wpn_scythe', 'wpn_dagger',
  'helm_iron', 'shield_tower', 'chest_plate', 'chest_robe',
  'item_potion', 'item_potion2', 'item_gold', 'item_ring', 'item_amulet', 'item_belt', 'item_boots', 'item_gloves', 'item_tome',
  'tile_crypt', 'tile_catacomb', 'tile_torture', 'tile_hell',
  'dec_sarcophagus', 'dec_bones', 'dec_chest', 'dec_portal', 'title_bg', 'icon-192', 'icon-512',
].map(a => './assets/' + a + (a.startsWith('icon') ? '.png' : '.webp'));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // ядро обязано закэшироваться; ассеты — сколько получится (отсутствующие не валят установку)
    await cache.addAll(CORE);
    await Promise.allSettled(ASSETS.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const resp = await fetch(e.request);
      if (resp.ok && new URL(e.request.url).origin === location.origin) {
        const cache = await caches.open(VERSION);
        cache.put(e.request, resp.clone());
      }
      return resp;
    } catch {
      return cached || Response.error();
    }
  })());
});

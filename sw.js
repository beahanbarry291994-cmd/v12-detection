// ============================================================
// Service Worker for YOLO 目标检测 Web 应用
// 版本: v1
// 缓存策略: HTML=NetworkFirst, CDN模型=CacheFirst, 其他=StaleWhileRevalidate
// ============================================================

const CACHE_NAME = 'v12-detection-v1';
const MODEL_CACHE_NAME = 'yolo-model-cache';

// 预缓存资源列表
const PRECACHE_ASSETS = [
  '/index_v12.html',
  // '/knowledge_base.json', // 如果文件存在，取消此行注释
];

// CDN 域名白名单 - 模型文件使用 CacheFirst 策略
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'jsd.cdn.zzko.cn',
  'cdn.jsdmirror.com',
];

// ============================================================
// Install 事件 - 预缓存资源
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching assets:', PRECACHE_ASSETS);
      // 使用 { cache: 'reload' } 确保获取最新版本
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn(`[SW] Failed to precache ${url}:`, err);
          })
        )
      );
    })
  );

  // 立即激活，不等待旧 SW 退出
  self.skipWaiting();
});

// ============================================================
// Activate 事件 - 清理旧缓存
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');

  const validCaches = new Set([CACHE_NAME, MODEL_CACHE_NAME]);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!validCaches.has(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // 立即控制所有客户端
  self.clients.claim();
});

// ============================================================
// Fetch 事件 - 根据请求类型选择缓存策略
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // 策略1: CDN 模型文件 -> CacheFirst (独立缓存空间)
  if (isCDNModelRequest(url)) {
    event.respondWith(cacheFirstModel(request));
    return;
  }

  // 策略2: HTML 文件 -> NetworkFirst
  if (isHTMLRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 策略3: 其他资源 -> StaleWhileRevalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ============================================================
// 判断请求类型
// ============================================================

/** 是否为 CDN 模型文件请求 */
function isCDNModelRequest(url) {
  return CDN_HOSTS.some((host) => url.hostname === host);
}

/** 是否为 HTML 请求 */
function isHTMLRequest(request) {
  const accept = request.headers.get('accept') || '';
  return (
    accept.includes('text/html') ||
    request.url.endsWith('.html') ||
    request.url.endsWith('/')
  );
}

// ============================================================
// 缓存策略实现
// ============================================================

/**
 * NetworkFirst - 网络优先策略
 * 优先从网络获取，失败时回退到缓存 (适用于 HTML)
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // 网络请求成功，更新缓存
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    console.log('[SW] Network failed, falling back to cache:', request.url);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // 如果是导航请求且缓存也没有，返回离线页面
    if (request.mode === 'navigate') {
      return caches.match('/index_v12.html');
    }

    // 无缓存可用，返回错误响应
    return new Response('Network error and no cache available', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

/**
 * CacheFirst - 缓存优先策略 (适用于 CDN 模型文件)
 * 优先从缓存获取，缓存未命中时从网络获取并缓存
 * 使用独立的 yolo-model-cache 存储空间
 */
async function cacheFirstModel(request) {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    console.log('[SW] Model cache hit:', request.url);
    return cachedResponse;
  }

  console.log('[SW] Model cache miss, fetching:', request.url);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // 模型文件可能很大，clone 后存入缓存
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    console.error('[SW] Failed to fetch model:', request.url, err);
    return new Response('Model unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

/**
 * StaleWhileRevalidate - 重新验证策略 (适用于其他资源)
 * 先返回缓存，同时在后台更新缓存
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // 后台更新：无论缓存是否命中，都发起网络请求更新缓存
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((err) => {
      console.log('[SW] Background fetch failed:', request.url);
    });

  // 缓存命中则直接返回，否则等待网络响应
  return cachedResponse || fetchPromise;
}

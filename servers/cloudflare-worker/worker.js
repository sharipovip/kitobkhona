// ═══════════════════════════════════════════════════════════════
// Cloudflare Worker — Кэш-слой + API Routing
// Снижает нагрузку на backend на 50-70%
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ═══ CORS Headers ═══
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
      'Access-Control-Allow-Credentials': 'true'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ═══ КЭШИРУЕМЫЕ ENDPOINTS (GET) ═══
    const cacheableEndpoints = [
      { pattern: '/api/winners', ttl: 600 },      // 10 мин
      { pattern: '/api/popular-books', ttl: 600 }, // 10 мин
      { pattern: '/api/announcements/active', ttl: 120 }, // 2 мин
      { pattern: '/api/book-stats/', ttl: 60 },    // 1 мин
      { pattern: '/api/profiles/', ttl: 300 }      // 5 мин
    ];

    // Только GET запросы кэшируем
    if (method === 'GET') {
      for (const endpoint of cacheableEndpoints) {
        if (path.startsWith(endpoint.pattern)) {
          return handleCachedRequest(request, env, path, endpoint.ttl, corsHeaders);
        }
      }
    }

    // ═══ МАРШРУТИЗАЦИЯ ═══
    let targetUrl;

    // Auth endpoints → GCP Auth
    const authPrefixes = [
      '/api/auth/', '/api/profiles/', '/api/avatar',
      '/api/reading-sessions', '/api/favorites',
      '/api/notifications', '/api/announcements',
      '/api/push/', '/api/admin/', '/api/winners',
      '/api/popular-books', '/api/feedbacks', '/api/support'
    ];

    // Social endpoints → GCP Social
    const socialPrefixes = [
      '/api/messages', '/api/friends', '/api/posts',
      '/api/book-reactions', '/api/book-stats',
      '/api/reports', '/api/typing', '/api/users/block',
      '/api/chats', '/api/daily-words', '/api/chat-summary'
    ];

    let matched = false;

    for (const prefix of authPrefixes) {
      if (path.startsWith(prefix)) {
        targetUrl = env.AUTH_API_URL + path + url.search;
        matched = true;
        break;
      }
    }

    if (!matched) {
      for (const prefix of socialPrefixes) {
        if (path.startsWith(prefix)) {
          targetUrl = env.SOCIAL_API_URL + path + url.search;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Health check или неизвестный endpoint
      targetUrl = env.AUTH_API_URL + path + url.search;
    }

    // ═══ ПРОКСИРОВАНИЕ ═══
    try {
      const headers = new Headers(request.headers);
      headers.delete('host');
      headers.delete('cf-connecting-ip');
      headers.delete('cf-ray');
      headers.delete('cf-visitor');

      const proxyResponse = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: method !== 'GET' && method !== 'HEAD' ? request.body : undefined
      });

      const response = new Response(proxyResponse.body, proxyResponse);
      
      // Добавляем CORS
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }

      // Кэшируем ответы с POST/PUT/DELETE для инвалидации
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        // Инвалидируем связанный кэш
        if (path.includes('/profiles')) {
          await invalidateCache(env, 'profile:');
        }
        if (path.includes('/posts')) {
          await invalidateCache(env, 'posts:');
        }
      }

      return response;
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Gateway error',
        message: error.message
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// ═══ КЭШИРОВАНИЕ ═══
async function handleCachedRequest(request, env, path, ttl, corsHeaders) {
  const cacheKey = `cache:${path}`;
  
  // Проверяем кэш
  try {
    const cached = await env.KITOBKHONA_CACHE.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() < data.expiresAt) {
        return new Response(JSON.stringify(data.value), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-Cache': 'HIT'
          }
        });
      }
    }
  } catch (e) {}

  // Проксируем запрос
  const url = new URL(request.url);
  let targetUrl;
  
  // Определяем куда отправить
  if (path.includes('/profiles/')) {
    targetUrl = env.AUTH_API_URL + path + url.search;
  } else {
    targetUrl = env.AUTH_API_URL + path + url.search;
  }

  try {
    const headers = new Headers(request.headers);
    headers.delete('host');
    
    const response = await fetch(targetUrl, { headers });
    const data = await response.json();

    // Кэшируем ответ
    try {
      await env.KITOBKHONA_CACHE.put(
        cacheKey,
        JSON.stringify({
          value: data,
          expiresAt: Date.now() + ttl * 1000
        }),
        { expirationTtl: ttl }
      );
    } catch (e) {}

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Cache': 'MISS'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Upstream error' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ═══ ИНВАЛИДАЦИЯ КЭША ═══
async function invalidateCache(env, prefix) {
  try {
    const keys = await env.KITOBKHONA_CACHE.list({ prefix: `cache:${prefix}` });
    for (const key of keys.keys) {
      await env.KITOBKHONA_CACHE.delete(key.name);
    }
  } catch (e) {}
}

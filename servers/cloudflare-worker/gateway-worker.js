// ═══════════════════════════════════════════════════════════════
// Cloudflare Worker – Kitobkhona API Gateway
// Маршрутизирует запросы между Auth (Cloudflare Worker) и Social (Render)
// Деплоить как отдельный Worker, например: kitobkhona-api-gateway
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // URLs серверов (из переменных окружения или запасные)
    const AUTH_API = env.AUTH_API_URL || 'https://kitobkhona-auth-worker.tojik.workers.dev';
    const SOCIAL_API = env.SOCIAL_API_URL || 'https://kitobkhona-social.onrender.com';

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
      'Access-Control-Allow-Credentials': 'true'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ═══ HEALTH CHECK ═══
    if (path === '/health' || path === '/') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'kitobkhona-api-gateway',
        version: '2.1.0',
        time: new Date().toISOString(),
        upstreams: { auth: AUTH_API, social: SOCIAL_API }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ═══ МАРШРУТЫ → SOCIAL API (Render) ═══
    const socialRoutes = [
      '/api/book-stats-batch',
      '/api/book-stats',
      '/api/book-reactions',
      '/api/posts',
      '/api/friends',
      '/api/messages',
      '/api/chat-summary',
      '/api/typing',
      '/api/users/block',
      '/api/reports',
      '/api/daily-words',
      '/api/winners',
      '/api/popular-books',
      '/api/announcements'
    ];

    const isSocialRoute = socialRoutes.some(route => path.startsWith(route));

    if (isSocialRoute) {
      return proxyTo(request, path, SOCIAL_API, corsHeaders);
    }

    // ═══ ВСЁ ОСТАЛЬНОЕ → AUTH WORKER ═══
    // (auth, profiles, reading-sessions, favorites, notifications, push, admin, feedbacks, support)
    return proxyTo(request, path, AUTH_API, corsHeaders);
  }
};

// ═══ Универсальная функция прокси ═══
async function proxyTo(request, path, targetBaseUrl, corsHeaders) {
  try {
    const url = new URL(request.url);
    const targetUrl = `${targetBaseUrl}${path}${url.search}`;

    const headers = new Headers(request.headers);
    // Удаляем Cloudflare-специфичные заголовки
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');
    headers.delete('cf-ipcountry');

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json'
      }
    });
  } catch (e) {
    console.error(`[GATEWAY] Proxy error to ${targetBaseUrl}${path}:`, e.message);
    return new Response(JSON.stringify({
      error: 'Upstream server unavailable',
      details: e.message,
      target: `${targetBaseUrl}${path}`
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Cloudflare Worker: serve o site (pasta public) e as rotas /api/*, com o mesmo código das funções do Netlify.
import checkout from '../netlify/functions/checkout.mjs';
import funil from '../netlify/functions/funil.mjs';
import config from '../netlify/functions/config.mjs';
import portfolio from '../netlify/functions/portfolio.mjs';
import previa from '../netlify/functions/previa.mjs';
import asaasWebhook from '../netlify/functions/asaas-webhook.mjs';

const ROTAS = {
  '/api/checkout': checkout,
  '/api/funil': funil,
  '/api/config': config,
  '/api/previa': previa,
  '/api/asaas-webhook': asaasWebhook,
};

export default {
  async fetch(request, env, ctx) {
    Object.assign(process.env, env); // variáveis e segredos do Cloudflare viram process.env
    const url = new URL(request.url);
    const ip = request.headers.get('cf-connecting-ip') || '';

    // Lista do portfólio: guarda por alguns minutos para não consultar a planilha a cada visita.
    if (url.pathname === '/api/portfolio') {
      if (request.method !== 'GET') return portfolio(request, { ip });
      const chave = new Request(url.origin + '/api/portfolio');
      const guardada = await caches.default.match(chave);
      if (guardada) return guardada;
      const r = await portfolio(request, { ip });
      if (!r.ok) return r;
      const resp = new Response(r.body, r);
      const prazo = /s-maxage=(\d+)/.exec(r.headers.get('Netlify-CDN-Cache-Control') || '')?.[1] || '30';
      resp.headers.set('Cache-Control', `public, max-age=60, s-maxage=${prazo}`);
      resp.headers.delete('Netlify-CDN-Cache-Control');
      ctx.waitUntil(caches.default.put(chave, resp.clone()));
      return resp;
    }

    const rota = ROTAS[url.pathname];
    if (rota) return rota(request, { ip });
    if (url.pathname.startsWith('/api/')) return new Response('', { status: 404 });

    // Link de prévia (/p/codigo): abre o mesmo site, que lê o código do endereço. Fora do Google.
    if (url.pathname.startsWith('/p/')) {
      const r = await env.ASSETS.fetch(new Request(url.origin + '/index.html', { headers: request.headers }));
      const resp = new Response(r.body, r);
      resp.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      resp.headers.set('Cache-Control', 'no-store');
      return resp;
    }

    return env.ASSETS.fetch(request);
  },
};

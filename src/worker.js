// Cloudflare Worker: serve o site (pasta public) e as rotas /api/*, com o mesmo código das funções do Netlify.
import checkout from '../netlify/functions/checkout.mjs';
import funil from '../netlify/functions/funil.mjs';
import config from '../netlify/functions/config.mjs';
import portfolio from '../netlify/functions/portfolio.mjs';
import previa from '../netlify/functions/previa.mjs';
import asaasWebhook from '../netlify/functions/asaas-webhook.mjs';
import meuip from '../netlify/functions/meuip.mjs';
import briefing from '../netlify/functions/briefing.mjs';
import pedidoExterno from '../netlify/functions/pedido-externo.mjs';
import { equipeConfere } from '../netlify/lib/util.mjs';

const ROTAS = {
  '/api/checkout': checkout,
  '/api/funil': funil,
  '/api/config': config,
  '/api/previa': previa,
  '/api/asaas-webhook': asaasWebhook,
  '/api/meuip': meuip,
  '/api/pedido-externo': pedidoExterno,
  '/api/briefing': briefing,
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

    // Cookie da equipe: o painel abre o site com ?eq=SENHA uma vez em cada aparelho. Se a senha confere com EQ_TOKEN,
    // o Worker grava o cookie (1 ano) e volta para o mesmo endereço sem a senha na barra.
    if (!url.pathname.startsWith('/api/') && url.searchParams.has('eq') && (request.method === 'GET' || request.method === 'HEAD')) {
      const t = url.searchParams.get('eq') || '';
      url.searchParams.delete('eq');
      const h = new Headers({ Location: url.pathname + url.search, 'Cache-Control': 'no-store' });
      if (/^[A-Za-z0-9_.~-]{12,80}$/.test(t) && equipeConfere(t)) {
        h.append('Set-Cookie', `miau_eq=${t}; Max-Age=31536000; Path=/; Secure; HttpOnly; SameSite=Lax`);
      }
      return new Response(null, { status: 302, headers: h });
    }

    const rota = ROTAS[url.pathname];
    if (rota) return rota(request, { ip });
    if (url.pathname.startsWith('/api/')) return new Response('', { status: 404 });

    // Link de prévia (/p/codigo): abre o mesmo site, que lê o código do endereço. Fora do Google.
    if (url.pathname.startsWith('/p/')) {
      const r = await env.ASSETS.fetch(new Request(url.origin + '/index.html', { headers: request.headers }));
      const T = 'Vídeo feito para você · Studios Miau';
      const D = 'Toque para assistir e conte pra gente o que achou. Link privado.';
      const IMG = url.origin + '/og-previa.jpg';
      const alvo = {
        'meta[property="og:title"]': T, 'meta[name="twitter:title"]': T,
        'meta[property="og:description"]': D, 'meta[name="twitter:description"]': D,
        'meta[name="description"]': D, 'meta[property="og:image"]': IMG,
        'meta[name="twitter:image"]': IMG, 'meta[property="og:url"]': url.origin + url.pathname,
      };
      let rw = new HTMLRewriter().on('title', { element(e) { e.setInnerContent(T); } });
      for (const [sel, val] of Object.entries(alvo)) {
        rw = rw.on(sel, { element(e) { e.setAttribute('content', val); } });
      }
      const resp = new Response(rw.transform(r).body, r);
      resp.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      resp.headers.set('Cache-Control', 'no-store');
      return resp;
    }

    // Formulário pós-pagamento (/b/TOKEN): página própria, fora do Google e sem cache.
    if (url.pathname.startsWith('/b/')) {
      const r = await env.ASSETS.fetch(new Request(url.origin + '/briefing.html', { headers: request.headers }));
      const resp = new Response(r.body, r);
      resp.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      resp.headers.set('Cache-Control', 'no-store');
      resp.headers.set('Referrer-Policy', 'no-referrer');
      return resp;
    }

    return env.ASSETS.fetch(request);
  },
};

// Entrega ao site a lista de vídeos do portfólio, lida da aba "Portfólio" da planilha (via Apps Script).
// Vocês mudam a planilha e o site atualiza em até 5 minutos, sem deploy.
// Só passam vídeos do YouTube; o resto é descartado.
import { idYoutube } from '../lib/youtube.mjs';
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, n);

export { idYoutube };

export function montarLista(videos) {
  const vistos = new Set(), out = [];
  for (const v of Array.isArray(videos) ? videos : []) {
    const id = idYoutube(v && v.link);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ id, nicho: txt(v.nicho, 40), titulo: txt(v.titulo, 80), destaque: v.destaque === true, horizontal: String(v.formato || '').toLowerCase() === 'horizontal' });
    if (out.length >= 30) break;
  }
  return out;
}

const resposta = (obj, segundosCdn) => new Response(JSON.stringify(obj), {
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    // O Netlify guarda a resposta por alguns minutos: a planilha não é consultada a cada visita.
    'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${segundosCdn}, stale-while-revalidate=86400`,
  },
});

export default async (req) => {
  if (req.method !== 'GET') return new Response('', { status: 405 });
  const url = process.env.PAINEL_WEBHOOK_URL;
  if (!url) return resposta({ videos: [] }, 300);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: process.env.PAINEL_TOKEN || '', evento: 'portfolio' }),
      signal: AbortSignal.timeout(9000),
    });
    const j = await r.json();
    if (!j || j.ok !== true) throw new Error('Planilha respondeu sem a lista' + (j && j.erro ? ': ' + j.erro : ''));
    return resposta({ videos: montarLista(j.videos) }, 300);
  } catch (e) {
    console.error('Portfólio:', String(e.message || e));
    return resposta({ videos: [] }, 30); // tenta de novo logo
  }
};

export const config = { path: '/api/portfolio' };

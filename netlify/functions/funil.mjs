// Registra por onde o cliente passou e onde parou. Não guarda preço nem pagamento.
// Antes do cliente preencher nome e WhatsApp, só chegam códigos da etapa (nada que identifique a pessoa).
import { encaminhar } from '../lib/util.mjs';

const EVENTOS = ['ver', 'abrir', 'etapa', 'contato', 'saiu'];
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const site = new URL(req.url);
  const origem = req.headers.get('origin');
  const permitidas = [site.origin, process.env.SITE_ORIGEM].filter(Boolean);
  if (origem && !permitidas.includes(origem)) return new Response(null, { status: 403 });
  if (Number(req.headers.get('content-length') || 0) > 4000) return new Response(null, { status: 413 });

  let p;
  try { p = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400 }); }
  if (!p || typeof p !== 'object') return new Response(null, { status: 400 });
  const sid = txt(p.sid, 24);
  const ev = txt(p.ev, 10);
  if (!/^[a-z0-9]{8,24}$/.test(sid) || !EVENTOS.includes(ev)) return new Response(null, { status: 400 });

  await encaminhar({
    evento: 'funil', sid, ev, quando: new Date().toISOString(),
    pagina: txt(p.pagina, 20), item: txt(p.item, 40), modo: txt(p.modo, 12), periodo: txt(p.periodo, 20), forma: txt(p.forma, 10),
    rede_extra: txt(p.rede_extra, 60), etapa: txt(p.etapa, 20), n: Math.min(30, Number(p.n) || 0), de: Math.min(30, Number(p.de) || 0),
    objetivo: txt(p.objetivo, 80), segmento: txt(p.segmento, 80), aparecer: txt(p.aparecer, 40), cidade: txt(p.cidade, 80),
    nome: txt(p.nome, 80), whatsapp: txt(p.whatsapp, 20), empresa: txt(p.empresa, 80), instagram: txt(p.instagram, 40), email: txt(p.email, 120),
  });
  return new Response(null, { status: 204 });
};

export const config = {
  path: '/api/funil',
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

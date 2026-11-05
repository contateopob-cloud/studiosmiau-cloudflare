// Página de prévia: um link temporário (/p/CODIGO) com um vídeo feito para um possível cliente.
// A lista fica na aba "Prévias" da planilha (Apps Script). Aqui só repassamos o que a página precisa.
//   GET  /api/previa?c=CODIGO            -> dados do vídeo (conta a visualização e avisa a equipe na primeira vez)
//   POST /api/previa {c, r}              -> r = gostei | ajustes | duvida (guarda e avisa a equipe)
import { json, painel, telegram } from '../lib/util.mjs';
import { idYoutube } from '../lib/youtube.mjs';

const CODIGO = /^[a-z0-9-]{6,40}$/;
const RESPOSTAS = ['gostei', 'ajustes', 'duvida'];
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, n);
const indisponivel = () => json({ ok: false }, 404); // mesma resposta para "não existe", "expirou" e "desligada"

export default async (req) => {
  const site = new URL(req.url);

  if (req.method === 'GET') {
    const codigo = String(site.searchParams.get('c') || '').toLowerCase();
    if (!CODIGO.test(codigo)) return indisponivel();
    try {
      const j = await painel({ evento: 'previa', codigo });
      const p = j && j.ok && j.previa;
      const id = p && idYoutube(p.link);
      if (!id) return indisponivel();
      return json({ ok: true, previa: { id, cliente: txt(p.cliente, 60), empresa: txt(p.empresa, 80), mensagem: txt(p.mensagem, 300), validoAte: /^\d{4}-\d{2}-\d{2}$/.test(p.validoAte) ? p.validoAte : '', horizontal: String(p.formato || '') === 'horizontal' } });
    } catch (e) {
      console.error('Prévia:', String(e.message || e));
      return json({ ok: false, erro: 'indisponivel' }, 503);
    }
  }

  if (req.method === 'POST') {
    const origem = req.headers.get('origin');
    const permitidas = [site.origin, process.env.SITE_ORIGEM].filter(Boolean);
    if (origem && !permitidas.includes(origem)) return json({ erro: 'Origem não permitida.' }, 403);
    if (Number(req.headers.get('content-length') || 0) > 2000) return json({ erro: 'Pedido grande demais.' }, 413);
    let b;
    try { b = await req.json(); } catch { return json({ erro: 'Pedido inválido.' }, 400); }
    const codigo = String((b && b.c) || '').toLowerCase(), resposta = String((b && b.r) || '');
    if (!CODIGO.test(codigo) || !RESPOSTAS.includes(resposta)) return json({ erro: 'Pedido inválido.' }, 400);
    try {
      const j = await painel({ evento: 'previa_resposta', codigo, resposta });
      if (!j || !j.ok) return indisponivel();
      await Promise.allSettled([telegram(`PRÉVIA: ${txt(j.cliente, 60)}${j.empresa ? ' · ' + txt(j.empresa, 80) : ''} respondeu: ${txt(j.resposta, 30).toUpperCase()}${j.whatsapp ? '\nWhatsApp: ' + txt(j.whatsapp, 20) : ''}`)]);
      return json({ ok: true });
    } catch (e) {
      console.error('Prévia resposta:', String(e.message || e));
      return json({ ok: false, erro: 'indisponivel' }, 503);
    }
  }

  return json({ erro: 'Método não permitido.' }, 405);
};

export const config = {
  path: '/api/previa',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }, // limita tentativas de adivinhar códigos
};

// Formulário que o cliente responde DEPOIS de pagar (link enviado pelo painel, /b/TOKEN).
//   GET  /api/briefing?t=TOKEN  -> {ok, nome, produto, tipo, servico, premium}
//   POST /api/briefing  {t, r:[{k,q,a}]} -> manda as respostas ao painel (evento "briefing") e ao Telegram.
import { json, telegram, encaminhar, verificarBriefing, visitante } from '../lib/util.mjs';

const lim = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

export default async (req, context) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const d = verificarBriefing(url.searchParams.get('t'));
    if (!d) return json({ ok: false, erro: 'Link inválido.' }, 404);
    return json({ ok: true, nome: lim(d.n, 40), produto: lim(d.p, 80), tipo: d.t === 'plano' ? 'plano' : 'servico', servico: lim(d.s, 20), premium: d.v === 1 });
  }
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405);
  if (Number(req.headers.get('content-length') || 0) > 30000) return json({ ok: false, erro: 'Resposta grande demais.' }, 413);
  let b; try { b = await req.json(); } catch { return json({ ok: false, erro: 'Pedido inválido.' }, 400); }
  const d = verificarBriefing(b && b.t);
  if (!d) return json({ ok: false, erro: 'Link inválido.' }, 404);
  if (!process.env.PAINEL_WEBHOOK_URL && !(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)) return json({ ok: false, erro: 'Não foi possível enviar agora. Chame a equipe no WhatsApp.' }, 503);
  const itens = (Array.isArray(b.r) ? b.r : []).slice(0, 30)
    .map((x) => ({ k: lim(x && x.k, 30).replace(/[^a-z0-9_]/gi, ''), q: lim(x && x.q, 200), a: lim(x && x.a, 1500) }))
    .filter((x) => x.k && x.a);
  if (!itens.length) return json({ ok: false, erro: 'Responda pelo menos uma pergunta.' }, 400);
  const respostas = Object.fromEntries(itens.map((x) => [x.k, x.a]));
  const nome = lim(d.n, 40), produto = lim(d.p, 80);
  const resumo = itens.map((x) => `${x.q}\n${x.a}`).join('\n\n');
  const texto = `FORMULÁRIO DE INÍCIO RECEBIDO\nPedido: ${d.i}${nome ? ' · ' + nome : ''}${produto ? ' · ' + produto : ''}\n\n${resumo}`;
  await Promise.allSettled([
    telegram(texto),
    encaminhar({ evento: 'briefing', pedido: d.i, nome, produto, tipo: d.t === 'plano' ? 'plano' : 'servico', respostas, resumo, texto, ...visitante(req, context, { prefixar: true }) }),
  ]);
  return json({ ok: true });
};

export const config = { path: '/api/briefing' };

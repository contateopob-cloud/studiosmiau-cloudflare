// POST /api/pedido-externo  (usado pelo painel/IA do WhatsApp, nunca pelo navegador do cliente)
// A IA só manda plano, período e forma (ou serviço avulso, quantidade e forma); o valor é calculado AQUI (precos.mjs) e a cobrança é criada no Asaas.
// Senha: cabeçalho X-Painel-Token (mesmo PAINEL_TOKEN do /api/meuip). ?simular=1 devolve só o valor, sem criar nada.
import { cotacao, cotacaoServico, PLANOS, SERVICOS } from '../lib/precos.mjs';
import { json, limpar, assinarPedido, telegram, encaminhar, reais, painelConfere } from '../lib/util.mjs';
import { criarLink, textoPedido } from './checkout.mjs';

const PERIODOS = { mensal: 'mensal', 1: 'mensal', trimestral: 'trimestral', 3: 'trimestral', semestral: 'semestral', 6: 'semestral', anual: 'anual', 12: 'anual' };
const FORMAS = { pix: 'pix', cartao: 'cartao', 'cartão': 'cartao', credito: 'cartao' };
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const t = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

// Trava simples: 1 pedido por número a cada hora (guardada no cache do Cloudflare; o painel também limita).
async function travaChave(fone) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pedido-externo:' + fone));
  const h = [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://trava.interna/' + h);
}
const cacheTrava = () => globalThis.caches?.default;

export default async (req, context) => {
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405);
  const auth = req.headers.get('authorization') || '';
  const token = req.headers.get('x-painel-token') || (/^Bearer\s+(.+)$/i.exec(auth) || [])[1] || '';
  if (!painelConfere(token)) return json({ ok: false, erro: 'Não autorizado.' }, 401);
  if (Number(req.headers.get('content-length') || 0) > 20000) return json({ ok: false, erro: 'Pedido grande demais.' }, 413);

  let bruto;
  try { bruto = await req.json(); } catch { return json({ ok: false, erro: 'Pedido inválido.' }, 400); }
  const c = limpar(bruto);
  const simular = new URL(req.url).searchParams.get('simular') === '1';

  if (c.plano_id === 'sob medida' || c.plano_id === 'sob_medida' || c.plano_id === 'custom') return json({ ok: false, erro: 'Plano sob medida é com a equipe.' }, 422);
  const avulso = !!c.servico_id;
  if (avulso && !Object.hasOwn(SERVICOS, c.servico_id)) return json({ ok: false, erro: 'Serviço inválido.' }, 400);
  if (avulso && !SERVICOS[c.servico_id].a_partir_de) return json({ ok: false, erro: 'Este serviço é sob proposta: é com a equipe.' }, 422);
  if (!avulso && !Object.hasOwn(PLANOS, c.plano_id)) return json({ ok: false, erro: 'Plano inválido.' }, 400);
  const periodo = avulso ? '' : PERIODOS[c.periodo_id];
  const forma = FORMAS[c.forma.toLowerCase()];
  const cot = avulso ? cotacaoServico(c.servico_id, Number(bruto?.quantidade ?? 1), forma) : periodo && forma ? cotacao(c.plano_id, periodo, forma, c.rede_extra) : null;
  if (!cot) return json({ ok: false, erro: avulso ? 'Serviço, quantidade ou forma de pagamento inválidos.' : 'Plano, período ou forma de pagamento inválidos.' }, 400);

  const resumo = { valor_cobrado: reais(cot.valorCentavos), valor_centavos: cot.valorCentavos, plano: cot.plano, periodo: cot.periodo, forma: cot.forma, recorrente: cot.recorrente, parcelas: cot.forma === 'cartao' ? cot.parcelas : 1 };
  if (simular) return json({ ok: true, simulacao: true, ...resumo });

  // ---- dados do cliente ----
  const fone = c.whatsapp.replace(/\D/g, '');
  const doc = c.documento.replace(/\D/g, '');
  const a = bruto && typeof bruto.aceite === 'object' && bruto.aceite ? bruto.aceite : null;
  if (!c.nome) return json({ ok: false, erro: 'Falta o nome.' }, 400);
  if (!c.empresa) return json({ ok: false, erro: 'Falta o nome da empresa.' }, 400);
  if (fone.length < 10 || fone.length > 15) return json({ ok: false, erro: 'WhatsApp inválido.' }, 400);
  if (doc.length !== 11 && doc.length !== 14) return json({ ok: false, erro: 'CPF ou CNPJ inválido.' }, 400);
  if (!EMAIL.test(c.email)) return json({ ok: false, erro: 'E-mail inválido.' }, 400);
  if (!a || !t(a.texto_versao, 40) || !t(a.em, 40)) return json({ ok: false, erro: 'Falta o aceite dos termos (texto_versao e em).' }, 400);

  const cache = cacheTrava(), chaveTrava = cache ? await travaChave(fone) : null;
  if (cache && await cache.match(chaveTrava)) return json({ ok: false, erro: 'Já existe um pedido recente deste número. Chame a equipe.' }, 429);

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const registro = {
    ...c, pedido: id, recebido_em: new Date().toISOString(), modo: avulso ? 'service' : 'plan', origem: 'whatsapp', sid: '', plano_id: avulso ? '' : c.plano_id, periodo_id: periodo, forma: cot.forma,
    aceite: true, termos_versao: t(a.texto_versao, 40), aceite_msg_id: t(a.msg_id, 80), aceite_em: t(a.em, 40), aceite_canal: 'whatsapp',
    ip: '', ip_cidade: '', ip_regiao: '', ip_pais: '', rede: '', ua: '', eq: '', // quem chama é o painel, não o cliente
  };
  registro.order_nsu = assinarPedido(id, cot.pixCentavos);
  registro.valor_cobrado = reais(cot.valorCentavos);

  let link;
  try {
    link = await criarLink({ cot, id, nsu: registro.order_nsu, origem: new URL(req.url).origin });
  } catch (e) {
    console.error('Asaas (pedido-externo):', String(e.message || e).slice(0, 300));
    return json({ ok: false, erro: 'Não foi possível criar o link de pagamento. Nada foi cobrado.' }, 502);
  }
  registro.link_pagamento = link;
  if (cache) await cache.put(chaveTrava, new Response('1', { headers: { 'Cache-Control': 'max-age=3600' } }));

  await Promise.allSettled([telegram(textoPedido(registro, cot, link)), encaminhar({ evento: 'pedido', ...registro })]);
  return json({ ok: true, pedido: id, ...resumo, link_pagamento: link });
};

export const config = { path: '/api/pedido-externo' };

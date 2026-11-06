// Recebe os avisos do Asaas. Nunca confiamos só no aviso:
// 1) o token secreto (cabeçalho asaas-access-token) tem de bater;
// 2) o pagamento é relido direto na API do Asaas (status e valor);
// 3) o link que originou o pagamento precisa ter o número de pedido assinado por nós.
import { tokenWebhookOk, verificarPedido, NSU_REGEX, telegram, encaminhar, reais, asaas, assinarBriefing } from '../lib/util.mjs';
import { SERVICOS } from '../lib/precos.mjs';

const PAGO = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'];
const ID = /^[A-Za-z0-9_-]{3,60}$/;

// Do nome do link ("Studios Miau - Plano Médio 3 meses - SM-...") tira o produto, o tipo e o serviço.
function produtoDoLink(nome) {
  const teste = /\(TESTE\)/.test(String(nome || ''));
  const p = String(nome || '').replace(' (TESTE)', '').replace(/^Studios Miau - /, '').replace(/ - SM-[a-z0-9]+-\d+-[a-f0-9]+$/, '').trim().slice(0, 80);
  const plano = /^Plano /.test(p);
  const sv = plano ? '' : Object.keys(SERVICOS).find((k) => p.startsWith(SERVICOS[k].nome)) || '';
  return { produto: p, tipo: plano ? 'plano' : 'servico', servico: sv, premium: /^Plano Premium/.test(p), teste };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('', { status: 405 });
  if (!tokenWebhookOk(req.headers.get('asaas-access-token'))) return new Response('', { status: 401 });

  let ev;
  try { ev = await req.json(); } catch { return new Response('', { status: 400 }); }
  const evento = String(ev.event || '');
  // Só interessam os dois eventos em que o dinheiro entrou. Os demais são ignorados.
  if (evento !== 'PAYMENT_CONFIRMED' && evento !== 'PAYMENT_RECEIVED') return new Response('ok', { status: 200 });
  const payId = ev.payment && ev.payment.id;
  if (!ID.test(String(payId || ''))) return new Response('ok', { status: 200 });

  let pay, link = null, cliente = null;
  try {
    pay = await asaas('GET', `/payments/${encodeURIComponent(payId)}`); // fonte da verdade: status e valor
    if (pay.paymentLink && ID.test(String(pay.paymentLink))) {
      try { link = await asaas('GET', `/paymentLinks/${encodeURIComponent(pay.paymentLink)}`); } catch (e) { console.error('link:', e.message); }
    }
    if (pay.customer && ID.test(String(pay.customer))) {
      try { cliente = await asaas('GET', `/customers/${encodeURIComponent(pay.customer)}`); } catch { /* opcional */ }
    }
  } catch (e) {
    console.error('Asaas:', e.message);
    return new Response('', { status: 502 }); // o Asaas tenta de novo
  }

  if (!PAGO.includes(pay.status)) {
    await telegram(`Aviso do Asaas sem pagamento confirmado\nCobrança: ${payId}\nStatus: ${pay.status}`);
    return new Response('ok', { status: 200 });
  }

  const valor = Math.round(Number(pay.value || 0) * 100);
  const forma = pay.billingType === 'PIX' ? 'Pix' : pay.billingType === 'CREDIT_CARD' ? 'Cartão' : String(pay.billingType || '');
  const quem = cliente && cliente.name ? String(cliente.name).slice(0, 80) : '';
  const parcela = pay.installmentNumber ? ` · parcela ${pay.installmentNumber}` : '';
  const mensal = pay.subscription ? ' · cobrança mensal' : '';

  // Acha o nosso pedido no link (referência externa ou nome) e confere a assinatura.
  const achado = link ? (`${link.externalReference || ''} ${link.name || ''}`.match(NSU_REGEX) || [])[0] : '';
  const pedido = achado ? verificarPedido(achado) : null;

  if (!pedido) {
    const msg = `Pagamento recebido no Asaas, mas NÃO ligado a um pedido do site\nCobrança: ${payId}\n${forma} · ${reais(valor)}${quem ? ' · ' + quem : ''}\nConfira no painel do Asaas antes de começar.`;
    await Promise.allSettled([telegram(msg), encaminhar({ evento: 'alerta', titulo: 'Pagamento NÃO ligado a um pedido do site', texto: msg, cobranca: payId })]);
    return new Response('ok', { status: 200 });
  }
  const valorLink = Math.round(Number(link.value || 0) * 100);
  if (valorLink < pedido.pixCentavos - 1) {
    const msg = `ATENÇÃO: o link deste pedido tem valor abaixo do esperado\nPedido: ${pedido.id}\nLink: ${reais(valorLink)} · esperado no mínimo ${reais(pedido.pixCentavos)}\nNão comece o trabalho antes de conferir no Asaas.`;
    await Promise.allSettled([telegram(msg), encaminhar({ evento: 'alerta', titulo: 'Valor do link abaixo do esperado', texto: msg, pedido: pedido.id, cobranca: payId })]);
    return new Response('ok', { status: 200 });
  }

  const pl0 = produtoDoLink(link.name);
  const titulo = (pl0.teste ? '[TESTE] ' : '') + (evento === 'PAYMENT_RECEIVED' && forma === 'Cartão'
    ? 'SALDO DISPONÍVEL (cartão): o valor já está na conta Asaas'
    : 'PAGAMENTO CONFIRMADO');
  const nota = evento === 'PAYMENT_CONFIRMED' && forma === 'Cartão'
    ? 'Cartão aprovado. O saldo cai na conta em cerca de 32 dias.'
    : 'Confirmado direto no Asaas.';
  // Link do formulário de início (briefing). É o mesmo em todos os avisos do pedido (parcelas, meses): o painel manda uma vez só.
  const pl = produtoDoLink(link.name);
  const origem = process.env.SITE_ORIGEM || new URL(req.url).origin;
  const briefing_url = `${origem}/b/${assinarBriefing({ i: pedido.id, n: quem.split(' ')[0] || '', p: pl.produto, t: pl.tipo, s: pl.servico, v: pl.premium ? 1 : 0 })}`;
  const texto = [
    titulo,
    `Pedido: ${pedido.id}`,
    `${forma} · ${reais(valor)}${parcela}${mensal}${quem ? ' · ' + quem : ''}`,
    nota,
    `Formulário de início do cliente: ${briefing_url}`,
  ].join('\n');
  await Promise.allSettled([
    telegram(texto),
    encaminhar({ evento: 'pagamento', titulo, pedido: pedido.id, forma, valor_centavos: valor, valor: reais(valor), parcela: pay.installmentNumber || 1, mensal: !!pay.subscription, cliente: quem, cobranca: payId, tipo_aviso: evento, produto: pl.produto, tipo: pl.tipo, briefing_url, ...(pl.teste ? { teste: true } : {}), texto }),
  ]);
  return new Response('ok', { status: 200 });
};

export const config = { path: '/api/asaas-webhook' };

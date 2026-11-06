// Recebe o pedido do site, calcula o preço AQUI no servidor, cria o link de pagamento no Asaas
// e avisa a equipe no Telegram. O navegador nunca manda preço nem link.
import { cotacao, PLANOS, SERVICOS } from '../lib/precos.mjs';
import { json, limpar, assinarPedido, telegram, encaminhar, reais, ehLinkAsaas, asaas, visitante } from '../lib/util.mjs';

const MODOS = ['plan', 'custom', 'service', 'contato'];

export default async (req, context) => {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  // Só aceita pedidos vindos do próprio site
  const site = new URL(req.url);
  const origem = req.headers.get('origin');
  const permitidas = [site.origin, process.env.SITE_ORIGEM].filter(Boolean);
  if (origem && !permitidas.includes(origem)) return json({ erro: 'Origem não permitida.' }, 403);
  if (Number(req.headers.get('content-length') || 0) > 20000) return json({ erro: 'Pedido grande demais.' }, 413);

  let bruto;
  try { bruto = await req.json(); } catch { return json({ erro: 'Pedido inválido.' }, 400); }
  const c = limpar(bruto);
  if (c.website) return json({ ok: true }); // campo escondido preenchido: robô

  if (!MODOS.includes(c.modo)) return json({ erro: 'Pedido inválido.' }, 400);
  const fone = c.whatsapp.replace(/\D/g, '');
  if (!c.nome || fone.length < 10) return json({ erro: 'Confira o seu nome e o WhatsApp.' }, 400);
  // CPF/CNPJ e aceite dos termos só na contratação direta de plano; orçamentos e pedidos de serviço não pedem.
  if (c.modo === 'plan') {
    const doc = c.documento.replace(/\D/g, '');
    if (doc.length !== 11 && doc.length !== 14) return json({ erro: 'Confira o CPF ou CNPJ.' }, 400);
    if (!c.aceite) return json({ erro: 'É preciso aceitar os termos.' }, 400);
  }
  if (c.modo !== 'contato' && !c.empresa) return json({ erro: 'Escreva o nome da empresa.' }, 400);
  if (c.modo === 'plan' && !Object.hasOwn(PLANOS, c.plano_id)) return json({ erro: 'Plano inválido.' }, 400);
  if (c.modo === 'service' && !Object.hasOwn(SERVICOS, c.servico_id)) return json({ erro: 'Serviço inválido.' }, 400);

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const registro = {
    pedido: id, recebido_em: new Date().toISOString(), ip: context.ip || '',
    navegador: (req.headers.get('user-agent') || '').slice(0, 200), ...c,
    ...visitante(req, context, { prefixar: true }), // ip, rede, ua, eq, ip_cidade, ip_regiao, ip_pais
  };
  delete registro.website;

  let pagamento_url = null, cot = null;
  if (c.modo === 'plan') {
    cot = cotacao(c.plano_id, c.periodo_id, c.forma, c.rede_extra);
    if (!cot) return json({ erro: 'Plano, período ou forma de pagamento inválidos.' }, 400);
    registro.order_nsu = assinarPedido(id, cot.pixCentavos);
    registro.valor_cobrado = reais(cot.valorCentavos);
    try {
      pagamento_url = await criarLink({ cot, id, nsu: registro.order_nsu, origem: site.origin });
    } catch (e) {
      registro.erro_pagamento = String(e.message || e).slice(0, 300);
      console.error('Asaas:', registro.erro_pagamento);
    }
  }

  await Promise.allSettled([telegram(textoPedido(registro, cot, pagamento_url)), encaminhar({ evento: 'pedido', ...registro })]);
  return json({ ok: true, pedido: id, pagamento_url });
};

// Monta o link: cada combinação de período e forma de pagamento tem o seu tipo de cobrança.
//   Mensal  + cartão  -> assinatura mensal no cartão
//   Mensal  + Pix     -> assinatura mensal com um Pix por mês
//   3/6/12m + Pix     -> cobrança única com o total no Pix
//   3/6/12m + cartão  -> total no cartão, em até N parcelas
export function corpoLink({ cot, id, nsu, origem, hoje = new Date() }) {
  const fim = new Date(hoje.getTime() + 7 * 864e5).toISOString().slice(0, 10); // o link fecha em 7 dias
  const body = {
    name: `Studios Miau - Plano ${cot.plano} ${cot.periodo}${cot.rede ? ' + ' + cot.rede : ''} - ${nsu}`,
    description: `Plano ${cot.plano}, ${cot.periodo}${cot.rede ? ', com ' + cot.rede : ''}. Pedido ${nsu}`,
    value: Number((cot.valorCentavos / 100).toFixed(2)),
    billingType: cot.forma === 'pix' ? 'PIX' : 'CREDIT_CARD',
    chargeType: cot.recorrente ? 'RECURRENT' : cot.forma === 'pix' ? 'DETACHED' : 'INSTALLMENT',
    externalReference: nsu,
    notificationEnabled: true,
    isAddressRequired: false,
    endDate: fim,
  };
  // O Asaas exige o prazo (em dias úteis) para pagar Pix; o valor mínimo de Pix na conta é R$ 10,00.
  if (cot.forma === 'pix') body.dueDateLimitDays = 3;
  if (cot.recorrente) body.subscriptionCycle = 'MONTHLY';
  if (body.chargeType === 'INSTALLMENT') body.maxInstallmentCount = cot.parcelas;
  // O redirecionamento só funciona se o domínio do site estiver nos dados comerciais da conta Asaas.
  if (process.env.ASAAS_REDIRECIONAR === 'sim') body.callback = { successUrl: `${origem}/?pedido=${id}`, autoRedirect: true };
  return body;
}

async function criarLink(p) {
  const j = await asaas('POST', '/paymentLinks', corpoLink(p));
  const url = [j.url, j.link, j.paymentUrl].find(ehLinkAsaas);
  if (!url) throw new Error('Resposta sem link do Asaas: ' + JSON.stringify(j).slice(0, 200));
  return url;
}

function textoPedido(r, cot, url) {
  const linhas = [
    r.modo === 'plan' ? 'NOVO PEDIDO DE PLANO' : r.modo === 'contato' ? 'NOVA MENSAGEM DO SITE' : 'NOVO PEDIDO DO SITE',
    `Pedido: ${r.pedido}`,
    cot ? `Plano ${cot.plano}${cot.rede ? ' + ' + cot.rede : ' (só Instagram)'} · ${cot.periodo} · ${cot.forma === 'pix' ? 'Pix' : 'Cartão'} · ${reais(cot.valorCentavos)}${cot.recorrente ? ' por mês' : ''}${cot.teste ? ' (TESTE)' : ''}` : '',
    r.modo === 'service' ? `Serviço: ${SERVICOS[r.servico_id]?.nome}` : '',
    r.modo === 'custom' && r.sob_medida ? `Sob medida: ${r.sob_medida.stories} stories/semana, ${r.sob_medida.reels} Reels/mês, ${r.sob_medida.carr} carrosséis/mês, ${r.sob_medida.visita} visitas/mês` : '',
    '',
    `${r.nome}${r.empresa ? ' · ' + r.empresa : ''} ${r.instagram}`,
    `WhatsApp: ${r.whatsapp}${r.email ? ' · ' + r.email : ''}`,
    r.objetivo && `Objetivo: ${r.objetivo}`, r.segmento && `Ramo: ${r.segmento}`,
    r.aparecer && `Nos vídeos: ${r.aparecer}`, r.cidade && `Cidade: ${r.cidade}`,
    r.mensagem && `Mensagem: ${r.mensagem}`,
    '',
    r.aceite ? `Aceite dos termos ${r.termos_versao} em ${r.recebido_em} · IP ${r.ip} · doc ${r.documento}` : '',
    url ? 'Link de pagamento criado. Aguardando pagamento.' : r.modo === 'plan' ? `ATENÇÃO: link não criado (${r.erro_pagamento || 'sem detalhe'}). Mande o link manualmente.` : '',
  ];
  return linhas.filter((l) => l !== '' && l != null).join('\n').replace(/\n{3,}/g, '\n\n');
}

export const config = {
  path: '/api/checkout',
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ['ip', 'domain'] }, // no máx. 8 pedidos por minuto por IP
};

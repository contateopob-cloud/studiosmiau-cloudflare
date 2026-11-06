// Tabela de preços usada para COBRAR. O site só mostra; quem decide o valor é este arquivo.
// Ao mudar um preço aqui, mude também no CFG do public/index.html (que é só a vitrine).

export const PERIODOS = {
  // taxa = taxa do cartão do Asaas + custo da antecipação (receber em até 2 dias), embutidos no preço do cartão, arredondados para cima.
  // Taxas da conta (fora da promoção, que vai até 03/02/2027): à vista 2,99%, 2 a 6x 3,49%, 7 a 12x 3,99%, mais R$ 0,49 por cobrança.
  // Antecipação: 1,25% ao mês (à vista) e 1,7% ao mês por parcela (parcelado). Custo total por período:
  //   mensal 2,99+1,25=4,24% -> 4,5% | 3x 3,49+3,40=6,89% -> 7% | 6x 3,49+5,95=9,44% -> 9,5% | 12x 3,99+11,05=15,04% -> 15,5%
  // Se mudar as taxas da conta, ajuste aqui e no CFG.periods do index.html.
  mensal:     { label: 'Mensal',   meses: 1,  desconto: 0,    parcelas: 1,  taxa: 0.045 },
  trimestral: { label: '3 meses',  meses: 3,  desconto: 0.05, parcelas: 3,  taxa: 0.07 },
  semestral:  { label: '6 meses',  meses: 6,  desconto: 0.10, parcelas: 6,  taxa: 0.095 },
  anual:      { label: '12 meses', meses: 12, desconto: 0.15, parcelas: 12, taxa: 0.155 },
};

export const PLANOS = {
  // redeExtra: valor por mês para levar a mesma produção a mais uma rede (cerca de 30% do plano, PROVISÓRIO: confirme os valores). O id 'completo' é o plano Premium.
  essencial: { nome: 'Essencial', mensal: 1197, visita: false, redeExtra: 360 },
  medio:     { nome: 'Médio',     mensal: 1697, visita: false, redeExtra: 510 },
  completo:  { nome: 'Premium',   mensal: 2497, visita: true,  redeExtra: 750 },
};

export const REDES = ['TikTok', 'Facebook', 'YouTube Shorts'];

export const SERVICOS = {
  video:     { nome: 'Edição de vídeo', a_partir_de: 350, max: 20 },   // por Reels de 15 segundos a 1 minuto
  carrossel: { nome: 'Carrossel personalizado', a_partir_de: 90, max: 20 },
  pacote4:   { nome: 'Pacote com 4 carrosséis', a_partir_de: 320 },
  auditoria: { nome: 'Auditoria do perfil', a_partir_de: 97 },
  layout:    { nome: 'Layout do site', a_partir_de: 800 },
  musica:    { nome: 'Música personalizada', a_partir_de: 800 },
  site:      { nome: 'Site completo no ar', a_partir_de: 0 },
};

// Valores em centavos.
// Mensal: cobrança que se repete todo mês (assinatura). 3, 6 e 12 meses: uma cobrança só, com o total do período.
// O Pix tem o preço à vista; o cartão tem o preço com a taxa já embutida (sem a palavra juros).
// redesExtra: texto com as redes a mais separadas por vírgula (ex.: 'TikTok,Facebook'). Cada uma soma o valor redeExtra do plano.
export function cotacao(planoId, periodoId, forma, redesExtra = '', { semTeste = false, testeCentavos = 0 } = {}) {
  const plano = Object.hasOwn(PLANOS, planoId) ? PLANOS[planoId] : null;
  const per = Object.hasOwn(PERIODOS, periodoId) ? PERIODOS[periodoId] : null;
  if (!plano || !per || (forma !== 'pix' && forma !== 'cartao')) return null;
  const redes = String(redesExtra || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (redes.length > REDES.length || new Set(redes).size !== redes.length || redes.some((x) => !REDES.includes(x))) return null;
  const rede = redes.join(' + ');
  const mensal = plano.mensal + redes.length * plano.redeExtra;
  let pix = Math.round(mensal * (1 - per.desconto) * per.meses * 100);
  const teste = semTeste ? 0 : (testeCentavos || Number(process.env.TESTE_CENTAVOS || 0));
  if (teste >= 100) pix = teste; // modo de teste: cobra um valor pequeno
  const cartao = Math.round(pix / (1 - per.taxa));
  return {
    plano: plano.nome, periodo: per.label, meses: per.meses, recorrente: per.meses === 1 && !(teste >= 100), // em teste, nunca cria assinatura
    parcelas: per.parcelas, forma, visita: plano.visita, rede, redes,
    pixCentavos: pix, cartaoCentavos: cartao, valorCentavos: forma === 'pix' ? pix : cartao,
    teste: teste >= 100,
  };
}

// Serviço avulso: o valor da tabela é o que se cobra (preço por unidade x quantidade). Sem mensalidade, uma cobrança só.
// Cartão: mesma taxa do plano mensal (à vista). Serviço com valor 0 (site completo) é só proposta: devolve null.
export function cotacaoServico(servicoId, quantidade, forma, { semTeste = false, testeCentavos = 0 } = {}) {
  const sv = Object.hasOwn(SERVICOS, servicoId) ? SERVICOS[servicoId] : null;
  if (!sv || !sv.a_partir_de || (forma !== 'pix' && forma !== 'cartao')) return null;
  const max = sv.max || 1;
  const qtd = Number(quantidade || 1);
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > max) return null;
  let pix = Math.round(sv.a_partir_de * qtd * 100);
  const teste = semTeste ? 0 : (testeCentavos || Number(process.env.TESTE_CENTAVOS || 0));
  if (teste >= 100) pix = teste;
  const cartao = Math.round(pix / (1 - PERIODOS.mensal.taxa));
  return {
    servico: true, plano: sv.nome, periodo: qtd > 1 ? `${qtd} unidades` : '', qtd, meses: 0, recorrente: false, parcelas: 1,
    forma, visita: false, rede: '', redes: [], pixCentavos: pix, cartaoCentavos: cartao,
    valorCentavos: forma === 'pix' ? pix : cartao, teste: teste >= 100,
  };
}

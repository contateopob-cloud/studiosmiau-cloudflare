// GET /api/planos  (senha do painel em X-Painel-Token)
// Entrega o texto atual dos planos, entregas, descontos, serviços e pagamento para a IA do WhatsApp ler.
// Os preços vêm de precos.mjs (a mesma tabela que COBRA) e as entregas vêm do site (entregas.gen.mjs, gerado pelo build).
import { cotacao, cotacaoServico, PLANOS, SERVICOS, PERIODOS, REDES } from '../lib/precos.mjs';
import { ENTREGAS, GERADO, AREA, VISITA_EXTRA } from '../lib/entregas.gen.mjs';
import { json, reais, painelConfere } from '../lib/util.mjs';

const SEM_TESTE = { semTeste: true }; // o modo de teste de cobrança nunca vale para o que a IA diz ao cliente
const un = (c) => c / 100;
const R = (c) => reais(c).replace(/ /g, ' ');
const lista = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];

export function montarTexto() {
  const desc = Object.values(PERIODOS).filter((p) => p.desconto).map((p) => `${p.label} ${Math.round(p.desconto * 100)}%`).join(', ');
  const L = [];
  L.push(`PLANOS (todos para o Instagram da empresa; valor mensal à vista no Pix; o cartão fica um pouco maior porque a taxa já está no valor; descontos por período contratado: ${desc}):`);
  for (const [id, pl] of Object.entries(PLANOS)) {
    const e = (ENTREGAS[id]?.entregas || []).slice(1).map((x) => x.replace(/ \(ao vivo ou por relatório\) para ouvir o seu feedback/, ''));
    L.push(`- ${pl.nome}: ${R(pl.mensal * 100)}/mês no Pix. Entregas: ${e.join('; ')}.`);
    const cv = (per, forma) => cotacao(id, per, forma, '', SEM_TESTE);
    const m = cv('mensal', 'cartao'), t = cv('trimestral', 'pix'), tc = cv('trimestral', 'cartao'), s = cv('semestral', 'pix'), sc = cv('semestral', 'cartao'), a = cv('anual', 'pix'), ac = cv('anual', 'cartao');
    L.push(`  Valores: mensal ${R(m.pixCentavos)} no Pix ou ${R(m.cartaoCentavos)} no cartão por mês; 3 meses ${R(t.pixCentavos)} no Pix ou ${R(tc.cartaoCentavos)} no cartão em até 3x; 6 meses ${R(s.pixCentavos)} no Pix ou ${R(sc.cartaoCentavos)} no cartão em até 6x; 12 meses ${R(a.pixCentavos)} no Pix ou ${R(ac.cartaoCentavos)} no cartão em até 12x (total do período).`);
  }
  L.push(`- Rede extra: o plano é para o Instagram; levar a mesma produção a mais uma rede (${lista(REDES)}) custa por mês, cada uma: ${Object.entries(PLANOS).map(([, p]) => `${p.nome} +${R(p.redeExtra * 100)}`).join(', ')}.`);
  L.push(`- Visita técnica (gravação presencial) só em ${lista(AREA)}; o Premium inclui 1 por mês e nos outros planos pode ser contratada como extra por ${R(VISITA_EXTRA * 100)} cada.`);
  L.push('- Plano sob medida (quantidades personalizadas): é montado e orçado pela equipe.');
  L.push('SERVIÇOS AVULSOS (sem mensalidade, pagamento único; valor no Pix, o cartão é um pouco maior):');
  for (const [id, sv] of Object.entries(SERVICOS)) {
    if (!sv.a_partir_de) { L.push(`- ${sv.nome}: sob proposta, é com a equipe.`); continue; }
    const px = cotacaoServico(id, 1, 'pix', SEM_TESTE), cd = cotacaoServico(id, 1, 'cartao', SEM_TESTE);
    const nota = id === 'video' ? ' por Reels de 15 segundos a 1 minuto' : id === 'carrossel' ? ' por carrossel' : '';
    L.push(`- ${sv.nome}: ${R(px.pixCentavos)}${nota} no Pix ou ${R(cd.cartaoCentavos)} no cartão${sv.max > 1 ? `; pode pedir de 1 a ${sv.max}, o valor é multiplicado` : ''}.`);
  }
  L.push('PAGAMENTO E COMEÇO:');
  L.push('- Pix ou cartão de crédito, pela página segura do Asaas. Plano mensal: assinatura (cartão cobrado todo mês, ou um Pix por mês); 3, 6 e 12 meses: cobrança única do período. Plano mensal pode ser cancelado com aviso de 30 dias.');
  L.push('- Depois do pagamento o cliente recebe um formulário rápido no WhatsApp e a equipe chama em até 24 horas para começar.');
  L.push('- A IA nunca inventa valores: use somente os acima. Se o cliente pedir algo fora disso, passe para a equipe.');
  return L.join('\n');
}

const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

export default async (req) => {
  if (req.method !== 'GET') return json({ ok: false, erro: 'Método não permitido.' }, 405);
  const auth = req.headers.get('authorization') || '';
  const token = req.headers.get('x-painel-token') || (/^Bearer\s+(.+)$/i.exec(auth) || [])[1] || '';
  if (!painelConfere(token)) return json({ ok: false, erro: 'Não autorizado.' }, 401);
  const texto = montarTexto();
  const v = hash(texto), origem = process.env.SITE_ORIGEM || new URL(req.url).origin;
  return json({ ok: true, atualizado: GERADO, versao: v, imagem: `${origem}/img/planos-whatsapp.png?v=${v}`, texto });
};

export const config = { path: '/api/planos' };

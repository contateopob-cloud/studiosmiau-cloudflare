import { createHmac, timingSafeEqual } from 'node:crypto';

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const segredo = () => {
  const s = process.env.SEGREDO;
  if (!s || s.length < 24) throw new Error('Variável SEGREDO ausente ou curta (use 32+ caracteres aleatórios).');
  return s;
};
const hmac = (txt) => createHmac('sha256', segredo()).update(txt).digest('hex');
const igual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Número do pedido assinado: ninguém consegue inventar um pedido válido nem mudar o valor mínimo esperado.
export function assinarPedido(id, pixCentavos) {
  return `SM-${id}-${pixCentavos}-${hmac(`${id}.${pixCentavos}`).slice(0, 16)}`;
}
export const NSU_REGEX = /SM-[a-z0-9]{6,20}-\d{3,9}-[a-f0-9]{16}/;
export function verificarPedido(nsu) {
  const m = /^SM-([a-z0-9]{6,20})-(\d{3,9})-([a-f0-9]{16})$/.exec(String(nsu || ''));
  if (!m) return null;
  const [, id, cents, sig] = m;
  return igual(sig, hmac(`${id}.${cents}`).slice(0, 16)) ? { id, pixCentavos: Number(cents), nsu: m[0] } : null;
}

// O Asaas manda o token que vocês cadastraram no cabeçalho "asaas-access-token".
export const tokenWebhookOk = (t) => {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN || '';
  return esperado.length >= 32 && typeof t === 'string' && igual(t, esperado);
};

// Limpa o que veio do navegador: só texto, tamanho limitado, sem caracteres de controle.
const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
export function limpar(d) {
  const p = d && typeof d === 'object' ? d : {};
  return {
    sid: txt(p.sid, 24), modo: txt(p.modo, 12), termos_versao: txt(p.termos_versao, 40),
    plano_id: txt(p.plano_id, 20), periodo_id: txt(p.periodo_id, 20), forma: txt(p.forma, 10), rede_extra: txt(p.rede_extra, 60), servico_id: txt(p.servico_id, 20),
    sob_medida: p.sob_medida && typeof p.sob_medida === 'object'
      ? Object.fromEntries(['stories', 'reels', 'carr', 'visita'].map((k) => [k, Math.max(0, Math.min(40, Number(p.sob_medida[k]) || 0))]))
      : null,
    objetivo: txt(p.objetivo, 80), segmento: txt(p.segmento, 80), aparecer: txt(p.aparecer, 40),
    cidade: txt(p.cidade, 80), mensagem: txt(p.mensagem, 1500),
    nome: txt(p.nome, 80), empresa: txt(p.empresa, 80), instagram: txt(p.instagram, 40),
    whatsapp: txt(p.whatsapp, 20), email: txt(p.email, 120), documento: txt(p.documento, 20),
    aceite: p.aceite === true, website: txt(p.website, 80),
  };
}

export async function telegram(texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  // texto puro (sem parse_mode) para que nada digitado pelo cliente vire formatação ou link
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 4000), disable_web_page_preview: true }),
  });
}

// Opcional: manda o aviso para o programa de vocês (Apps Script do Google).
// O Apps Script não enxerga cabeçalhos, então a senha (PAINEL_TOKEN) vai dentro do corpo.
export async function encaminhar(registro) {
  const url = process.env.PAINEL_WEBHOOK_URL;
  if (!url) return;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: process.env.PAINEL_TOKEN || '', ...registro }),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) console.error('Painel HTTP', r.status);
  } catch (e) { console.error('Painel:', String(e.message || e)); }
}

// Pergunta algo ao Apps Script e devolve a resposta (JSON). Lança erro se o painel não estiver configurado ou não responder.
export async function painel(corpo) {
  const url = process.env.PAINEL_WEBHOOK_URL;
  if (!url) throw new Error('PAINEL_WEBHOOK_URL não configurada');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: process.env.PAINEL_TOKEN || '', ...corpo }),
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error('Painel HTTP ' + r.status);
  return await r.json();
}

// ---- Quem está visitando: IP, cidade aproximada, rede, navegador e cookie da equipe ----
// O Worker do Cloudflare é quem enxerga isso (o Apps Script não). Vai junto de cada evento enviado ao painel.
const lim = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
export function lerCookie(req, nome) {
  const m = new RegExp('(?:^|;\\s*)' + nome + '=([^;]*)').exec(req.headers.get('cookie') || '');
  try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
}
// prefixar: true -> ip_cidade, ip_regiao, ip_pais (nos eventos que já têm um campo "cidade" digitado pelo cliente: funil e pedido)
export function visitante(req, context, { prefixar = false } = {}) {
  const cf = req.cf || {};
  const geo = { cidade: lim(cf.city, 80), regiao: lim(cf.region, 80), pais: lim(cf.country, 2) };
  const o = {
    ip: lim(req.headers.get('cf-connecting-ip') || (context && context.ip) || '', 45),
    rede: lim(cf.asOrganization, 80),
    ua: lim(req.headers.get('user-agent'), 150),
    eq: lim(lerCookie(req, 'miau_eq'), 80),
  };
  if (prefixar) { o.ip_cidade = geo.cidade; o.ip_regiao = geo.regiao; o.ip_pais = geo.pais; } else Object.assign(o, geo);
  return o;
}
// O cookie da equipe confere com o EQ_TOKEN do Cloudflare? (o Apps Script confere de novo com o dele)
export const equipeConfere = (valor) => { const t = process.env.EQ_TOKEN || ''; return t.length >= 12 && !!valor && igual(valor, t); };
export const painelConfere = (valor) => { const t = process.env.PAINEL_TOKEN || ''; return t.length >= 12 && !!valor && igual(valor, t); };

export const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const ehLinkAsaas = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && (x.hostname === 'asaas.com' || x.hostname.endsWith('.asaas.com')); }
  catch { return false; }
};

// Chamada à API do Asaas. A chave fica só aqui no servidor.
export async function asaas(metodo, caminho, corpo) {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error('ASAAS_API_KEY não configurada');
  const base = process.env.ASAAS_URL
    || (process.env.ASAAS_AMBIENTE === 'sandbox' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3');
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', access_token: chave, 'User-Agent': 'StudiosMiau-Site' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const t = await r.text();
  let j = {}; try { j = JSON.parse(t); } catch {}
  if (!r.ok) { const e = new Error(`Asaas HTTP ${r.status}: ${t.slice(0, 300)}`); e.status = r.status; throw e; }
  return j;
}

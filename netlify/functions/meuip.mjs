// GET /api/meuip  -> {ip, cidade, regiao, pais, rede} de quem chamou.
// Protegida pela senha do painel (PAINEL_TOKEN), enviada no cabeçalho X-Painel-Token (ou Authorization: Bearer ...).
// O painel usa para o botão "Registrar este IP como da equipe". Aceita chamadas de outro endereço (o painel),
// porque a senha vai no cabeçalho e não em cookie.
import { json, visitante, painelConfere } from '../lib/util.mjs';

const cors = () => ({
  'Access-Control-Allow-Origin': process.env.PAINEL_ORIGEM || '*',
  'Access-Control-Allow-Headers': 'X-Painel-Token, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '600',
  Vary: 'Origin',
});
const comCors = (r) => { for (const [k, v] of Object.entries(cors())) r.headers.set(k, v); return r; };

export default async (req, context) => {
  if (req.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }));
  if (req.method !== 'GET') return comCors(json({ erro: 'Método não permitido.' }, 405));
  const auth = req.headers.get('authorization') || '';
  const token = req.headers.get('x-painel-token') || (/^Bearer\s+(.+)$/i.exec(auth) || [])[1] || '';
  if (!painelConfere(token)) return comCors(json({ erro: 'Não autorizado.' }, 401));
  const v = visitante(req, context);
  return comCors(json({ ip: v.ip, cidade: v.cidade, regiao: v.regiao, pais: v.pais, rede: v.rede }));
};

export const config = { path: '/api/meuip' };

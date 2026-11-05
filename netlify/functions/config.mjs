// Entrega ao site o número de WhatsApp configurado no Netlify (variável WHATSAPP).
// O número é público de qualquer forma (aparece no botão); aqui só evita editar o HTML para trocá-lo.
export default async (req) => {
  if (req.method !== 'GET') return new Response('', { status: 405 });
  let n = String(process.env.WHATSAPP || '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n; // só DDD + número: acrescenta o Brasil
  if (!/^\d{12,13}$/.test(n)) n = '';
  return new Response(JSON.stringify({ whatsapp: n }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};
export const config = { path: '/api/config' };

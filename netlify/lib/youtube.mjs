// Extrai o código de 11 caracteres de um link do YouTube. Só aceita youtu.be, youtube.com e youtube-nocookie.com.
const ID = /^[A-Za-z0-9_-]{11}$/;
export function idYoutube(link) {
  let u;
  try { u = new URL(String(link || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const partes = u.pathname.split('/').filter(Boolean);
    if (partes[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(partes[0])) id = partes[1];
  }
  return id && ID.test(id) ? id : null;
}

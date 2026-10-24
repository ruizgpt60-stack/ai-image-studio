const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const clamp = (v, d) => Math.min(Math.max(parseInt(v) || d, 256), 1024);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data } = await sb.auth.getUser(token);
  const user = data && data.user;
  if (!user) return json(401, { error: 'Sesión no válida. Inicia sesión de nuevo.' });

  let b; try { b = JSON.parse(event.body); } catch { return json(400, { error: 'Petición inválida' }); }
  const prompt = String(b.prompt || '').trim().slice(0, 700);
  if (prompt.length < 3) return json(400, { error: 'Escribe un prompt.' });

  const { data: credits, error } = await sb.rpc('consume_credit', { uid: user.id });
  if (error) return json(500, { error: 'No se pudo descontar el crédito.' });
  if (credits === null) return json(402, { error: 'Sin créditos' });

  // Para un proveedor de pago, cambia solo esta URL por la llamada a su API (con su clave en variables de entorno).
  const seed = Math.floor(Math.random() * 1e6);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${clamp(b.width, 768)}&height=${clamp(b.height, 768)}&seed=${seed}&nologo=true&model=flux`;
  return json(200, { url, credits });
};

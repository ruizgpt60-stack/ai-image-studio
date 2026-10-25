const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CF = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/`;
const H = { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' };
const SYS = 'You write prompts for an AI food photography model. Translate the user description (Spanish) to English and expand it into one vivid, concrete prompt under 60 words: ingredients, plating, lighting, background. Output only the prompt, nothing else.';
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

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
  if (credits === -1) return json(429, { error: 'Espera unos segundos antes de generar otra imagen.' });

  const style = String(b.style || '').slice(0, 300);
  let finalPrompt = `${prompt}, ${style}`;
  try {
    const t = await fetch(CF + '@cf/meta/llama-3.2-3b-instruct', { method: 'POST', headers: H, signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ messages: [{ role: 'system', content: SYS }, { role: 'user', content: prompt }], max_tokens: 120 }) });
    const tj = await t.json();
    const txt = tj && tj.result && tj.result.response;
    if (t.ok && txt) finalPrompt = `${String(txt).trim().replace(/^"|"$/g, '').slice(0, 600)}, ${style}`;
  } catch (e) { /* si falla la mejora, se usa el prompt original */ }

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      { method: 'POST', signal: AbortSignal.timeout(6000),
        headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, steps: 4 }) });
    const out = await r.json();
    const img = out && out.result && out.result.image;
    if (!r.ok || !img) throw new Error('sin imagen');
    return json(200, { image: 'data:image/jpeg;base64,' + img, credits });
  } catch (e) {
    await sb.rpc('refund_credit', { uid: user.id });
    return json(502, { error: 'No se pudo generar la imagen. Tu crédito fue devuelto; inténtalo de nuevo.' });
  }
};

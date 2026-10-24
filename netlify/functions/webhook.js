const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const sig = Buffer.from(event.headers['x-signature'] || '', 'hex');
  const mac = crypto.createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest();
  if (sig.length !== mac.length || !crypto.timingSafeEqual(sig, mac)) return { statusCode: 401, body: 'Firma inválida' };

  const p = JSON.parse(raw);
  if (p.meta.event_name !== 'order_created' || p.data.attributes.status !== 'paid') return { statusCode: 200, body: 'Ignorado' };
  const uid = p.meta.custom_data && p.meta.custom_data.user_id;
  if (!uid) return { statusCode: 200, body: 'Sin usuario' };

  const { error } = await sb.rpc('add_credits_once', {
    uid, amount: parseInt(process.env.CREDITS_PER_PACK || '50', 10), order_ref: String(p.data.id)
  });
  return error ? { statusCode: 500, body: 'Error' } : { statusCode: 200, body: 'OK' };
};

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data } = await sb.auth.getUser(token);
  const user = data && data.user;
  if (!user) return json(401, { error: 'Inicia sesión para comprar créditos.' });

  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`
    },
    body: JSON.stringify({ data: { type: 'checkouts',
      attributes: { checkout_data: { email: user.email, custom: { user_id: user.id } } },
      relationships: {
        store: { data: { type: 'stores', id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
        variant: { data: { type: 'variants', id: String(process.env.LEMONSQUEEZY_VARIANT_ID) } }
      } } })
  });
  const out = await res.json();
  if (!res.ok) return json(502, { error: 'No se pudo crear el pago. Revisa la configuración de Lemon Squeezy.' });
  return json(200, { url: out.data.attributes.url });
};

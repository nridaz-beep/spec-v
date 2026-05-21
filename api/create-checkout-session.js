// api/create-checkout-session.js
// Stripe Checkoutセッション作成API
// Vercel Serverless Functions (CommonJS)

const Stripe = require('stripe');

const PRICE_ID = 'price_1TYnROLsg6lzN1iRU9qMFmU8';
const SUCCESS_URL = 'https://spec-v.vercel.app/specv_form_v6_integrated_25.html';
const CANCEL_URL = 'https://spec-v.vercel.app/specv_form_v6_integrated_25.html?checkout=cancel';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'missing-key');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://spec-v.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[checkout] missing STRIPE_SECRET_KEY');
    return res.status(500).json({ error: 'server_config_missing' });
  }

  try {
    const { email } = req.body || {};

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${SUCCESS_URL}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      customer_email: email || undefined,
      allow_promotion_codes: true
    });

    return res.status(200).json({
      id: session.id,
      url: session.url
    });
  } catch (err) {
    console.error('[checkout] create session failed', {
      message: err && err.message,
      type: err && err.type,
      code: err && err.code
    });
    return res.status(500).json({ error: 'checkout_session_failed' });
  }
};

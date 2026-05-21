// api/stripe-webhook.js
// Stripe決済完了 → P版トークン自動発行
// Vercel Serverless Functions (CommonJS)

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY || 'missing-key');
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;
const supabase  = createClient(
  process.env.SUPABASE_URL || 'https://example.supabase.co',
  supabaseKey || 'missing-key'
);

const config = {
  api: { bodyParser: false }  // Stripe署名検証のためraw bodyが必要
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.SUPABASE_URL || !supabaseKey) {
    console.error('[stripe-webhook] missing env', {
      hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      hasStripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_KEY)
    });
    return res.status(500).json({ error: 'server_config_missing' });
  }

  // rawボディ取得
  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook署名エラー:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ============================================================
  // 決済完了イベント
  // ============================================================
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    if (session.payment_status === 'paid') {
      try {
        // 1. 次のPトークンID採番
        const nextId = await getNextTokenId('P');

        // 2. Supabaseにトークン保存
        const { error: tokenInsertError } = await supabase.from('tokens').insert({
          id:           nextId,
          type:         'paid',
          status:       'unused',
          issued_at:    new Date().toISOString(),
          note:         `Stripe自動発行 / ${session.customer_email || ''}`,
          issued_by:    'stripe_auto'
        });
        if (tokenInsertError) throw tokenInsertError;

        // 3. Stripe決済レコード保存
        const { error: sessionInsertError } = await supabase.from('stripe_sessions').insert({
          id:             session.id,
          token_id:       nextId,
          amount:         session.amount_total,
          currency:       session.currency,
          status:         'complete',
          customer_email: session.customer_email,
          created_at:     new Date().toISOString()
        });
        if (sessionInsertError) throw sessionInsertError;

        // 4. 受診者にURLメール送信（Resend）
        if (session.customer_email) {
          await sendTokenEmail(session.customer_email, nextId);
        }

        console.log(`P版トークン発行: ${nextId} → ${session.customer_email}`);

      } catch (err) {
        console.error('トークン発行エラー:', err);
        return res.status(500).json({ error: 'token_issue_failed' });
      }
    }
  }

  res.status(200).json({ received: true });
}

module.exports = handler;
module.exports.config = config;

// ============================================================
// ヘルパー：次のトークンID取得
// ============================================================
async function getNextTokenId(prefix) {
  const { data, error } = await supabase
    .from('tokens')
    .select('id')
    .like('id', `${prefix}%`)
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    return `${prefix}001`;
  }

  const lastNum = parseInt(data[0].id.slice(1));
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
}

// ============================================================
// ヘルパー：メール送信（Resend）
// ============================================================
async function sendTokenEmail(email, tokenId) {
  const url = `https://spec-v.vercel.app/specv_form_v6_integrated_25.html?token=${tokenId}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from:    'Spec-V <noreply@spec-v.jp>',
      to:      [email],
      subject: '【Spec-V】診断URLをお送りします',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#b8943a;">Spec-V 診断のご案内</h2>
          <p>お支払いありがとうございます。<br>以下のURLから診断をご受験ください。</p>
          <div style="background:#f5f5f0;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
            <a href="${url}" style="color:#b8943a;font-size:14px;word-break:break-all;">${url}</a>
          </div>
          <p style="color:#888;font-size:13px;">
            ※このURLは<strong>1回のみ</strong>有効です。<br>
            ※直感で答えてください。考えすぎず、コメント欄も思ったことをそのまま書いてください。
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error: ${err}`);
  }
}

// ============================================================
// ヘルパー：rawボディ取得
// ============================================================
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

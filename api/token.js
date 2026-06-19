// api/token.js
// トークン検証・使用済みマークAPI
// Vercel Serverless Functions (CommonJS)

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseKey || 'missing-key'
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://spec-v.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const debug = req.query.debug === '1';

  function logDbError(context, error) {
    console.error(`[token] ${context}`, {
      message: error && error.message,
      code: error && error.code,
      details: error && error.details,
      hint: error && error.hint
    });
  }

  function configStatus() {
    return {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
      hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY)
    };
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('[token] missing Supabase env', configStatus());
    return res.status(500).json({
      valid: false,
      reason: 'server_config_missing',
      ...(debug ? { debug: configStatus() } : {})
    });
  }

  // GET /api/token?id=F001
  if (req.method === 'GET') {
    const { id } = req.query;
    const tokenId = String(id || '').trim().toUpperCase();

    if (!tokenId) {
      return res.status(400).json({ valid: false, reason: 'token_missing' });
    }

    const { data, error } = await supabase
      .from('tokens')
      .select('id, type, status')
      .eq('id', tokenId)
      .maybeSingle();

    if (error) {
      logDbError('GET failed', error);
      return res.status(500).json({
        valid: false,
        reason: 'db_error',
        ...(debug ? { debug: { error: { message: error.message, code: error.code }, env: configStatus() } } : {})
      });
    }

    if (!data) return res.status(200).json({ valid: false, reason: 'not_found' });

    const status = String(data.status || '').trim().toLowerCase();
    if (status === 'used') return res.status(200).json({ valid: false, reason: 'already_used' });
    if (status === 'expired') return res.status(200).json({ valid: false, reason: 'expired' });
    if (!['unused', 'pending'].includes(status)) {
      return res.status(200).json({ valid: false, reason: 'invalid_status' });
    }

    return res.status(200).json({ valid: true, token_id: data.id, type: data.type });
  }

  // POST /api/token
  if (req.method === 'POST') {
    let body = req.body || {};

    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); }
      catch (e) { return res.status(400).json({ success: false, reason: 'invalid_json' }); }
    }

    const rawTokenId = body.token_id || body.id || body.token || req.query.id;
    const tokenId = String(rawTokenId || '').trim().toUpperCase();

    if (!tokenId) return res.status(400).json({ success: false, reason: 'token_missing' });

    const { data, error } = await supabase
      .from('tokens')
      .update({ status: 'used' })
      .eq('id', tokenId)
      .in('status', ['unused', 'pending'])
      .select('id, status')
      .maybeSingle();

    if (error) {
      logDbError('POST failed', error);
      return res.status(500).json({ success: false, reason: 'db_error' });
    }

    if (!data) return res.status(409).json({ success: false, reason: 'not_unused_or_not_found' });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// api/admin-tokens.js
// Admin token management API
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseUrl || !supabaseKey) {
    console.error('[admin-tokens] missing Supabase env');
    return res.status(500).json({ error: 'server_config_missing' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const tokens = await listTokens();
      return res.status(200).json({ tokens });
    }

    if (req.method === 'POST') {
      const token = normalizeInputToken(req.body || {});
      if (!token.id || !token.type) {
        return res.status(400).json({ error: 'invalid_token' });
      }

      const { data, error } = await supabase
        .from('tokens')
        .insert(token)
        .select('id, type, status, issued_at, note, org_id, department_id, announced_at, deadline, announced_by')
        .single();

      if (error) throw error;
      return res.status(200).json({ token: normalizeOutputToken(data) });
    }

    if (req.method === 'PATCH') {
      const id = String((req.body && req.body.id) || '').trim().toUpperCase();
      if (!id) return res.status(400).json({ error: 'token_missing' });

      const updates = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'note')) {
        updates.note = String(req.body.note || '');
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        const status = String(req.body.status || '').trim().toLowerCase();
        if (!['unused', 'pending', 'used'].includes(status)) {
          return res.status(400).json({ error: 'invalid_status' });
        }
        updates.status = status;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'update_missing' });
      }

      const { data, error } = await supabase
        .from('tokens')
        .update(updates)
        .eq('id', id)
        .select('id, type, status, issued_at, note, org_id, department_id, announced_at, deadline, announced_by')
        .single();

      if (error) throw error;
      return res.status(200).json({ token: normalizeOutputToken(data) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[admin-tokens] request failed', {
      method: req.method,
      message: error && error.message,
      code: error && error.code,
      details: error && error.details,
      hint: error && error.hint
    });
    return res.status(500).json({ error: 'db_error' });
  }
};


function isAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.warn('[admin-tokens] ADMIN_PASSWORD is not set; admin API is unprotected');
    return true;
  }
  const provided = String(req.headers['x-admin-password'] || '').trim();
  return provided === expected;
}

async function listTokens() {
  const extended = await supabase
    .from('tokens')
    .select('id, type, status, issued_at, note, org_id, department_id, announced_at, deadline, announced_by')
    .order('id', { ascending: true });

  if (!extended.error) return (extended.data || []).map(normalizeOutputToken);

  // 新カラムのDB反映前でも、既存トークン一覧は表示できるようにする。
  if (!isMissingTokenMetadataColumn(extended.error)) throw extended.error;
  const legacy = await supabase
    .from('tokens')
    .select('id, type, status, issued_at, note')
    .order('id', { ascending: true });
  if (legacy.error) throw legacy.error;
  return (legacy.data || []).map(normalizeOutputToken);
}

function isMissingTokenMetadataColumn(error) {
  const message = String(error && error.message || '').toLowerCase();
  return error && error.code === '42703' || message.includes('column') && (
    message.includes('org_id') ||
    message.includes('department_id') ||
    message.includes('announced_at') ||
    message.includes('deadline') ||
    message.includes('announced_by')
  );
}

function normalizeInputToken(raw) {
  const id = String(raw.id || '').trim().toUpperCase();
  const type = raw.type === 'paid' || id.startsWith('P') ? 'paid' : 'free';
  const status = ['pending', 'used', 'expired'].includes(raw.status) ? raw.status : 'unused';
  return {
    id,
    type,
    status,
    issued_at: raw.issued_at || new Date().toISOString(),
    note: raw.note || '',
    org_id: String(raw.org_id || '').trim() || null,
    department_id: String(raw.department_id || '').trim() || null,
    announced_at: raw.announced_at || null,
    deadline: raw.deadline || null,
    announced_by: String(raw.announced_by || '').trim() || null
  };
}

function normalizeOutputToken(token) {
  const rawStatus = String(token.status || '').trim().toLowerCase();
  const status = ['unused', 'pending', 'used', 'expired'].includes(rawStatus)
    ? rawStatus
    : 'unused';

  return {
    id: token.id,
    type: token.type,
    status,
    issued_at: formatDate(token.issued_at),
    note: token.note || '',
    org_id: token.org_id || '',
    department_id: token.department_id || '',
    announced_at: token.announced_at || '',
    deadline: token.deadline || '',
    announced_by: token.announced_by || ''
  };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

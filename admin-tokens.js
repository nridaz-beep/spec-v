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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseUrl || !supabaseKey) {
    console.error('[admin-tokens] missing Supabase env');
    return res.status(500).json({ error: 'server_config_missing' });
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
        .select('id, type, status, issued_at, used_at, note, issued_by')
        .single();

      if (error) throw error;
      return res.status(200).json({ token: normalizeOutputToken(data) });
    }

    if (req.method === 'PATCH') {
      const id = String((req.body && req.body.id) || '').trim().toUpperCase();
      const note = String((req.body && req.body.note) || '');
      if (!id) return res.status(400).json({ error: 'token_missing' });

      const { data, error } = await supabase
        .from('tokens')
        .update({ note })
        .eq('id', id)
        .select('id, type, status, issued_at, used_at, note, issued_by')
        .single();

      if (error) throw error;
      return res.status(200).json({ token: normalizeOutputToken(data) });
    }

    if (req.method === 'PUT') {
      const localTokens = Array.isArray(req.body && req.body.tokens) ? req.body.tokens : [];
      const result = await migrateLocalTokens(localTokens);
      const tokens = await listTokens();
      return res.status(200).json({ ...result, tokens });
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

async function listTokens() {
  const { data, error } = await supabase
    .from('tokens')
    .select('id, type, status, issued_at, used_at, note, issued_by')
    .order('id', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeOutputToken);
}

async function migrateLocalTokens(localTokens) {
  const normalized = localTokens
    .map(normalizeInputToken)
    .filter(t => t.id && t.type);

  if (normalized.length === 0) {
    return { inserted: 0, updatedNotes: 0 };
  }

  const ids = normalized.map(t => t.id);
  const { data: existingRows, error: selectError } = await supabase
    .from('tokens')
    .select('id, note')
    .in('id', ids);

  if (selectError) throw selectError;

  const existingIds = new Set((existingRows || []).map(t => t.id));
  const toInsert = normalized.filter(t => !existingIds.has(t.id));
  const toUpdateNotes = normalized.filter(t => existingIds.has(t.id) && t.note);

  if (toInsert.length > 0) {
    const { error } = await supabase.from('tokens').insert(toInsert);
    if (error) throw error;
  }

  let updatedNotes = 0;
  for (const token of toUpdateNotes) {
    const { error } = await supabase
      .from('tokens')
      .update({ note: token.note })
      .eq('id', token.id);
    if (error) throw error;
    updatedNotes += 1;
  }

  return { inserted: toInsert.length, updatedNotes };
}

function normalizeInputToken(raw) {
  const id = String(raw.id || '').trim().toUpperCase();
  const type = raw.type === 'paid' || id.startsWith('P') ? 'paid' : 'free';
  const status = raw.status === 'used' || raw.status === 'expired' ? raw.status : 'unused';
  return {
    id,
    type,
    status,
    issued_at: raw.issued_at || new Date().toISOString(),
    used_at: raw.used_at || null,
    note: raw.note || '',
    issued_by: raw.issued_by || 'admin'
  };
}

function normalizeOutputToken(token) {
  return {
    id: token.id,
    type: token.type,
    status: token.status || 'unused',
    issued_at: formatDate(token.issued_at),
    used_at: token.used_at ? formatDate(token.used_at) : '',
    note: token.note || '',
    issued_by: token.issued_by || ''
  };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

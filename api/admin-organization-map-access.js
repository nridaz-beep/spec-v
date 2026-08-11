// 組織マップの専用アクセスキーを管理者だけが発行する。
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseKey || 'missing-key');

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'server_config_missing' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });

  const orgId = String((req.method === 'GET' ? req.query.org_id : req.body && req.body.org_id) || '').trim();
  if (!isUuid(orgId)) return res.status(400).json({ error: 'org_id_required' });
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('organization_map_access').select('org_id, is_active, updated_at').eq('org_id', orgId).maybeSingle();
      if (error) throw error;
      return res.status(200).json({ access: data || null });
    }
    const accessKey = crypto.randomBytes(24).toString('base64url');
    const { error } = await supabase.from('organization_map_access').upsert({
      org_id: orgId,
      access_key_hash: sha256(accessKey),
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'org_id' });
    if (error) throw error;
    return res.status(200).json({ access_key: accessKey });
  } catch (error) {
    console.error('[admin-organization-map-access] failed', error && error.message);
    return res.status(500).json({ error: 'db_error' });
  }
};

function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = String(req.headers['x-admin-password'] || '');
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

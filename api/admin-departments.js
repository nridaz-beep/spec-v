// 部署登録API。受診率の集計ロジックは別フェーズで追加する。
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseKey || 'missing-key');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://spec-v.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'server_config_missing' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('departments').select('id, org_id, name, target_count').order('name', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ departments: data || [] });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const orgId = String(body.org_id || '').trim();
      const name = String(body.name || '').trim();
      const targetCount = Number(body.target_count || 0);
      if (!orgId || !name || !Number.isInteger(targetCount) || targetCount < 0) {
        return res.status(400).json({ error: 'invalid_department' });
      }
      const { data, error } = await supabase.from('departments').insert({ org_id: orgId, name, target_count: targetCount }).select('id, org_id, name, target_count').single();
      if (error) throw error;
      return res.status(200).json({ department: data });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[admin-departments] request failed', error && error.message);
    return res.status(500).json({ error: 'db_error' });
  }
};

function isAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return true;
  return String(req.headers['x-admin-password'] || '').trim() === expected;
}

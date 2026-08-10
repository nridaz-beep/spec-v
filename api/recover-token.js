// AI材料不足時の有料トークン救済API
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseKey || 'missing-key');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'server_config_missing' });

  const tokenId = String((req.body || {}).token_id || '').trim().toUpperCase();
  if (!/^P[A-Z0-9]+$/.test(tokenId)) return res.status(400).json({ error: 'paid_token_required' });

  try {
    const { data: source, error: sourceError } = await supabase
      .from('tokens')
      .select('id, type, status, note, org_id, department_id, announced_at, deadline, announced_by')
      .eq('id', tokenId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source || source.type !== 'paid') return res.status(404).json({ error: 'token_not_found' });

    if (source.status === 'used') {
      const { data: existing, error: existingError } = await supabase
        .from('tokens')
        .select('id, type, status, note')
        .eq('note', `自動再受診用：${tokenId}`)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return res.status(200).json({ token: existing, reused: true });
      return res.status(409).json({ error: 'token_already_used' });
    }
    if (!['unused', 'pending'].includes(source.status)) return res.status(409).json({ error: 'token_not_recoverable' });

    const { data: used, error: usedError } = await supabase
      .from('tokens')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', tokenId)
      .in('status', ['unused', 'pending'])
      .select('id')
      .maybeSingle();
    if (usedError) throw usedError;
    if (!used) return res.status(409).json({ error: 'token_already_used' });

    const { data: allTokens, error: listError } = await supabase.from('tokens').select('id').like('id', 'P%');
    if (listError) throw listError;
    const nextNumber = (allTokens || []).reduce((max, item) => {
      const value = Number(String(item.id || '').slice(1));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;
    const replacement = {
      id: `P${String(nextNumber).padStart(3, '0')}`,
      type: 'paid',
      status: 'unused',
      issued_at: new Date().toISOString(),
      issued_by: 'answer_quality_gate',
      note: `自動再受診用：${tokenId}`,
      org_id: source.org_id || null,
      department_id: source.department_id || null,
      announced_at: source.announced_at || null,
      deadline: source.deadline || null,
      announced_by: source.announced_by || null
    };
    const { data: created, error: createError } = await supabase.from('tokens').insert(replacement).select('id, type, status, note').single();
    if (createError) throw createError;
    return res.status(200).json({ token: created, reused: false });
  } catch (error) {
    console.error('[recover-token] failed', error && error.message);
    return res.status(500).json({ error: 'db_error' });
  }
};

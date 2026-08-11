// 組織マップ用の集計API。個人を識別できる値は返さない。
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseKey || 'missing-key');

const AXES = [
  ['suishin', '推進力', 'axis_suishinryoku'],
  ['doku', '毒のなさ', 'axis_doku'],
  ['kaihou', '解放度', 'axis_kaihoudu'],
  ['jiko', '自己認知精度', 'axis_jikoniinti'],
  ['tamashii', '魂', 'axis_tamashii'],
  ['ai', '愛', 'axis_ai']
];
const TYPE_ORDER = ['黎明型', '潤い型', '静水型', '孤炎型'];
const DEFAULT_RISK_THRESHOLDS = Object.freeze({ doku: 3.0, kaihou: 3.0 });
const DEFAULT_BASELINE = Object.freeze({ suishin: 4.5, doku: 4.5, kaihou: 4.5, jiko: 4.5, tamashii: 4.5, ai: 4.5 });
const MIN_DEPARTMENT_SAMPLE = 5;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'server_config_missing' });

  const orgId = String(req.query.org_id || '').trim();
  const departmentId = String(req.query.department_id || '').trim();
  if (!isUuid(orgId)) return res.status(400).json({ error: 'org_id_required' });

  try {
    const authorized = await authorize(req, orgId);
    if (!authorized) return res.status(401).json({ error: 'unauthorized' });

    if (departmentId && !await belongsToOrganization(departmentId, orgId)) {
      return res.status(404).json({ error: 'department_not_found' });
    }

    let query = supabase
      .from('organization_assessments')
      .select('department_id, type_name, axis_suishinryoku, axis_doku, axis_kaihoudu, axis_jikoniinti, axis_tamashii, axis_ai')
      .eq('org_id', orgId)
      .order('completed_at', { ascending: false })
      .limit(5000);
    if (departmentId) query = query.eq('department_id', departmentId);
    const { data: rows, error } = await query;
    if (error) throw error;

    const assessments = rows || [];
    const departments = await departmentNames(orgId);
    return res.status(200).json(buildMapPayload(assessments, departments, departmentId));
  } catch (error) {
    console.error('[organization-map] request failed', error && error.message);
    return res.status(500).json({ error: 'map_unavailable' });
  }
};

async function authorize(req, orgId) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const suppliedAdmin = String(req.headers['x-admin-password'] || '');
  if (adminPassword && safeEqual(suppliedAdmin, adminPassword)) return true;

  const suppliedKey = String(req.headers['x-org-map-key'] || '').trim();
  if (!suppliedKey) return false;
  const hash = sha256(suppliedKey);
  const { data, error } = await supabase
    .from('organization_map_access')
    .select('access_key_hash, is_active')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.is_active && safeEqual(hash, String(data.access_key_hash || '')));
}

async function belongsToOrganization(departmentId, orgId) {
  const { data, error } = await supabase
    .from('departments')
    .select('id')
    .eq('id', departmentId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function departmentNames(orgId) {
  const { data, error } = await supabase.from('departments').select('id, name').eq('org_id', orgId);
  if (error) throw error;
  return new Map((data || []).map(item => [item.id, item.name]));
}

function buildMapPayload(rows, departments, selectedDepartmentId) {
  const count = rows.length;
  const baseline = configuredBaseline();
  const thresholds = configuredThresholds();
  if (count < MIN_DEPARTMENT_SAMPLE) {
    return {
      sample_size: null,
      is_suppressed: true,
      selected_department_id: selectedDepartmentId || null,
      minimum_sample_size: MIN_DEPARTMENT_SAMPLE,
      privacy_note: '集計対象が5人に満たないため、個人が推測されないよう詳細は表示していません。'
    };
  }
  const averages = {};
  AXES.forEach(([key, , column]) => {
    averages[key] = count ? round(rows.reduce((sum, row) => sum + Number(row[column] || 0), 0) / count) : null;
  });
  const overall = count ? round(AXES.reduce((sum, [key]) => sum + averages[key], 0) / AXES.length) : null;
  const baselineOverall = round(Object.values(baseline).reduce((sum, value) => sum + value, 0) / AXES.length);
  const typeCounts = TYPE_ORDER.map(type => ({ type, count: rows.filter(row => row.type_name === type).length }));
  const risk = {
    flagged_count: rows.filter(row => Number(row.axis_doku) <= thresholds.doku || Number(row.axis_kaihoudu) <= thresholds.kaihou).length,
    axes: [
      { key: 'doku', label: '毒のなさ', count: rows.filter(row => Number(row.axis_doku) <= thresholds.doku).length },
      { key: 'kaihou', label: '解放度', count: rows.filter(row => Number(row.axis_kaihoudu) <= thresholds.kaihou).length }
    ]
  };

  return {
    sample_size: count,
    is_suppressed: count > 0 && count < MIN_DEPARTMENT_SAMPLE,
    selected_department_id: selectedDepartmentId || null,
    minimum_sample_size: MIN_DEPARTMENT_SAMPLE,
    summary: { overall, baseline_delta: overall === null ? null : round(overall - baselineOverall) },
    axes: AXES.map(([key, label]) => ({ key, label, organization: averages[key], industry: baseline[key] })),
    types: typeCounts,
    risk,
    departments: buildDepartmentSummary(rows, departments),
    privacy_note: '個人名・トークンID・個別スコアは表示しません。5人未満の部署は「その他」に統合しています。'
  };
}

function buildDepartmentSummary(rows, departments) {
  const groups = new Map();
  rows.forEach(row => {
    const id = row.department_id || '__unassigned__';
    groups.set(id, (groups.get(id) || 0) + 1);
  });
  let otherCount = 0;
  const visible = [];
  groups.forEach((count, id) => {
    if (count < MIN_DEPARTMENT_SAMPLE) otherCount += count;
    else visible.push({ id, name: departments.get(id) || '部署未設定', count });
  });
  if (otherCount) visible.push({ id: null, name: 'その他', count: otherCount });
  return visible.sort((a, b) => b.count - a.count);
}

function configuredBaseline() {
  try {
    const raw = JSON.parse(process.env.ORGANIZATION_MAP_INDUSTRY_BASELINE || '{}');
    return AXES.reduce((out, [key]) => ({ ...out, [key]: validScore(raw[key]) ? Number(raw[key]) : DEFAULT_BASELINE[key] }), {});
  } catch (_) {
    return { ...DEFAULT_BASELINE };
  }
}

function configuredThresholds() {
  try {
    const raw = JSON.parse(process.env.ORGANIZATION_MAP_RISK_THRESHOLDS || '{}');
    return {
      doku: validScore(raw.doku) ? Number(raw.doku) : DEFAULT_RISK_THRESHOLDS.doku,
      kaihou: validScore(raw.kaihou) ? Number(raw.kaihou) : DEFAULT_RISK_THRESHOLDS.kaihou
    };
  } catch (_) {
    return { ...DEFAULT_RISK_THRESHOLDS };
  }
}

function validScore(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 7; }
function round(value) { return Math.round(Number(value) * 100) / 100; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

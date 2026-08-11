// api/notify.js
// 診断完了通知API（メール送信 + トークン使用済み更新をサーバー側で完結）
// クライアント任せにしないことで、ネットワーク不安定・ブラウザ閉じ・JSエラーの影響を受けない

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

// Resendメール送信（リトライ付き）
async function sendMailWithRetry(apiKey, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { ok: true };
      const text = await res.text();
      console.warn(`[Notify] Resend失敗 (attempt ${i+1}): ${res.status} ${text}`);
    } catch (e) {
      console.warn(`[Notify] Resend接続失敗 (attempt ${i+1}):`, e.message);
    }
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  return { ok: false };
}

// トークン使用済み更新（リトライ付き）
async function markTokenUsedWithRetry(tokenId, maxRetries = 3) {
  if (!tokenId || tokenId === 'DEV') return { ok: true, skipped: true };

  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data, error } = await supabase
        .from('tokens')
        .update({ status: 'used' })
        .eq('id', String(tokenId).trim().toUpperCase())
        .in('status', ['unused', 'pending', 'used']) // 既にusedでも成功扱い
        .select('id, status')
        .maybeSingle();

      if (!error) return { ok: true, data };
      console.warn(`[Notify] Token更新失敗 (attempt ${i+1}):`, error.message);
    } catch (e) {
      console.warn(`[Notify] Token更新接続失敗 (attempt ${i+1}):`, e.message);
    }
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  return { ok: false };
}

// 組織に発行されたトークンだけ、集計専用の最小スナップショットを保存する。
// 個人情報やAI本文は保存せず、同一トークンは常に1件へ更新する。
async function saveOrganizationAssessment(d) {
  const tokenId = String(d.token_id || '').trim().toUpperCase();
  if (!tokenId || tokenId === 'DEV') return { ok: true, skipped: true };

  const { data: token, error: tokenError } = await supabase
    .from('tokens')
    .select('id, org_id, department_id')
    .eq('id', tokenId)
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (!token || !token.org_id) return { ok: true, skipped: true };

  const assessment = {
    token_id: token.id,
    org_id: token.org_id,
    department_id: token.department_id || null,
    completed_at: d.timestamp || new Date().toISOString(),
    type_name: String(d.type_name || '').trim(),
    axis_suishinryoku: score(d.axis_suishinryoku),
    axis_doku: score(d.axis_doku),
    axis_kaihoudu: score(d.axis_kaihoudu),
    axis_jikoniinti: score(d.axis_jikoniinti),
    axis_tamashii: score(d.axis_tamashii),
    axis_ai: score(d.axis_ai),
    updated_at: new Date().toISOString()
  };
  if (!assessment.type_name) return { ok: false, skipped: true };

  const { error } = await supabase
    .from('organization_assessments')
    .upsert(assessment, { onConflict: 'token_id' });
  if (error) throw error;
  return { ok: true };
}

function score(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 7 ? number : 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let data = req.body;
    if (typeof data === 'string') {
      try { data = JSON.parse(data || '{}'); }
      catch (e) { return res.status(400).json({ ok: false, reason: 'invalid_json' }); }
    }

    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.NOTIFY_EMAIL;
    const d = data || {};

    // === 1. トークン使用済み更新（サーバー側で確実に実行） ===
    let tokenResult = { ok: true, skipped: true };
    if (d.token_id) {
      tokenResult = await markTokenUsedWithRetry(d.token_id);
    }

    // 集計保存に失敗しても、診断完了・トークン処理・通知を止めない。
    let organizationMapResult = { ok: true, skipped: true };
    try {
      organizationMapResult = await saveOrganizationAssessment(d);
    } catch (error) {
      console.warn('[Notify] 組織マップ保存をスキップ:', error && error.message);
      organizationMapResult = { ok: false };
    }

    // === 2. メール送信 ===
    let mailResult = { ok: true, skipped: true };
    if (apiKey && toEmail) {
      const subject = `【Spec-V新規診断】${d.type_name || '?'} / ${d.age || '?'} / ${d.industry || '?'}`;

      const body = `
新規診断が完了しました。

■ 基本情報
日時：${d.timestamp}
トークンID：${d.token_id || '(DEV/なし)'}
年齢：${d.age}
職位：${d.position}
業界：${d.industry}
目的：${d.purpose}

■ タイプ
${d.type_name}（Lv.${d.level} ${d.level_name}）
${d.type_desc}
気質：${d.temperament}
モード：${d.mode}
ストレス：${d.stress}

■ 6軸スコア
推進力：${d.axis_suishinryoku}
毒のなさ：${d.axis_doku}
解放度：${d.axis_kaihoudu}
自己認知：${d.axis_jikoniinti}
魂：${d.axis_tamashii}
愛：${d.axis_ai}

■ コンピテンシー16項目
使命感：${d.comp_shimeikan} / ビジョン：${d.comp_vision} / 成長欲求：${d.comp_seichou}
先見的思考：${d.comp_senken} / 粘り強さ：${d.comp_nebari}
他者貢献：${d.comp_taisha} / 共感力：${d.comp_kyoukan} / 信頼構築：${d.comp_shinrai}
承認習慣：${d.comp_shounin} / 帰属意識：${d.comp_kizohu}
高潔さ：${d.comp_kouketsu} / 感情制御：${d.comp_kanjou} / 任せる力：${d.comp_makaseru}
攻撃性なさ：${d.comp_kougeki} / 心理的安全：${d.comp_shinri} / 多様性受容：${d.comp_tayousei}

■ 2次入力
${d.deep_input || '（なし）'}

■ 処理結果
トークン使用済み更新：${tokenResult.ok ? 'OK' : 'NG（要手動確認）'}

■ 全データJSON（PDF生成用）
${JSON.stringify(d, null, 2)}
`.trim();

      mailResult = await sendMailWithRetry(apiKey, {
        from: 'Spec-V <noreply@resend.dev>',
        to: [toEmail],
        subject,
        text: body,
      });
    }

    // 200を返す（クライアント側のリトライ判断材料として詳細も返す）
    return res.status(200).json({
      ok: true,
      token: tokenResult,
      organization_map: organizationMapResult,
      mail: mailResult,
    });

  } catch (err) {
    console.error('notify error:', err);
    // 500ではなく200で返す（クライアントのリトライループ防止＋画面影響なし）
    return res.status(200).json({ ok: false, error: err.message });
  }
};

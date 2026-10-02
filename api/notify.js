// api/notify.js
// 診断完了通知API（メール送信 + トークン使用済み更新をサーバー側で完結）
// クライアント任せにしないことで、ネットワーク不安定・ブラウザ閉じ・JSエラーの影響を受けない

const { createClient } = require('@supabase/supabase-js');
const { verifyTokenClaim } = require('./_token-claim');
const { validateResult, saveResult } = require('./_assessment-result');

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
        .update({ status: 'used', used_at: new Date().toISOString() })
        .eq('id', String(tokenId).trim().toUpperCase())
        .in('status', ['unused', 'pending'])
        .select('id, status')
        .maybeSingle();

      if (!error && data) return { ok: true, data };
      if (!error && !data) {
        // 二次分析や通知再送で最初の使用日時を上書きしない。
        const existing = await supabase.from('tokens').select('id, status, used_at').eq('id', String(tokenId).trim().toUpperCase()).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.status === 'used' && existing.data.used_at) return { ok: true, data: existing.data };
        if (existing.data?.status === 'used') {
          const repaired = await supabase.from('tokens').update({ used_at: new Date().toISOString() }).eq('id', existing.data.id).eq('status', 'used').is('used_at', null).select('id, status').maybeSingle();
          if (repaired.error) throw repaired.error;
          return { ok: true, data: existing.data };
        }
        return { ok: false, reason: 'token_not_found_or_inactive' };
      }
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://spec-v.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-specv-token, x-specv-claim, x-specv-bound-token');

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

    const tokenId = String(d.token_id || '').trim().toUpperCase();
    const boundTokenId = String(req.headers['x-specv-bound-token'] || '').trim().toUpperCase();
    if (boundTokenId && boundTokenId !== tokenId) {
      return res.status(403).json({ ok: false, reason: 'token_mismatch' });
    }
    const claim = verifyTokenClaim(d.claim, tokenId);
    if (!tokenId || tokenId === 'DEV' || !claim.valid) {
      return res.status(401).json({ ok: false, reason: 'diagnosis_session_required' });
    }
    if (!supabaseUrl || !supabaseKey || !apiKey || !toEmail) {
      return res.status(503).json({ ok: false, reason: 'notification_config_missing' });
    }

    let identity;
    try { identity=validateResult(d); }
    catch(error) { return res.status(422).json({ok:false,reason:error.message}); }
    Object.assign(d,identity);
    // Persist first. A storage failure is retryable and must never be reported as success.
    let organizationMapResult;
    try { organizationMapResult=await saveResult(supabase,d,identity); }
    catch(error) {
      const conflict=error.message==='assessment_identity_conflict'||error.code==='23505';
      console.warn('[Notify] Assessment storage failed:', error.code||error.message);
      return res.status(conflict?409:503).json({ok:false,reason:conflict?'assessment_identity_conflict':'assessment_storage_failed'});
    }
    const tokenResult=await markTokenUsedWithRetry(tokenId);

    // === 2. メール送信 ===
    let mailResult = { ok: true, skipped: true };
    if (apiKey && toEmail) {
      const subject = `【Spec-V新規診断】${d.type_name || '?'} / ${d.age || '?'} / ${d.industry || '?'}`;

      const body = `
新規診断が完了しました。

■ 基本情報
日時：${d.timestamp}
受診ID：${d.assessment_id||'未記録'}
測定版：${d.measurement_version||'legacy／版不明'}
採点版：${d.scoring_version||'legacy／版不明'}
トークンID：${d.token_id || '(DEV/なし)'}
年齢：${d.age}
職位：${d.position}
業界：${d.industry}
目的：${d.purpose}

■ タイプ
${d.type_name}（Lv.${d.level} ${d.level_name}）
${d.type_desc}
性向：${d.temperament}
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

■ 設問コメント
${Array.isArray(d.question_comments) && d.question_comments.length
  ? d.question_comments.map(item => `Q${item.question_no}: ${item.comment}`).join('\n')
  : '（なし）'}

■ 2次入力
${d.deep_input || '（なし）'}

■ 処理結果
トークン使用済み更新：${tokenResult.ok ? 'OK' : 'NG（要手動確認）'}

■ 全データJSON（PDF生成用）
${JSON.stringify(Object.fromEntries(Object.entries(d).filter(([key]) => key !== 'claim')), null, 2)}
`.trim();

      mailResult = await sendMailWithRetry(apiKey, {
        from: 'Spec-V <noreply@resend.dev>',
        to: [toEmail],
        subject,
        text: body,
      });
    }

    // 失敗を成功扱いにせず、クライアントの再送キューへ回す。
    const ok = tokenResult.ok && mailResult.ok && !mailResult.skipped;
    return res.status(ok ? 200 : 503).json({
      ok,
      token: tokenResult,
      assessment: identity,
      organization_map: organizationMapResult,
      mail: mailResult,
    });

  } catch (err) {
    console.error('notify error:', err);
    return res.status(500).json({ ok: false, reason: 'notification_failed' });
  }
};

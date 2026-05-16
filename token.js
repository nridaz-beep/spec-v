// api/token.js
// トークン検証・使用済みマークAPI
// Vercel Serverless Functions

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service_role key（サーバー側のみ）
);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://spec-v.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ============================================================
  // GET /api/token?id=F001
  // トークン有効性チェック
  // ============================================================
  if (req.method === 'GET') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ valid: false, reason: 'token_missing' });
    }

    const { data, error } = await supabase
      .from('tokens')
      .select('id, type, status')
      .eq('id', id.toUpperCase())
      .single();

    if (error || !data) {
      return res.status(200).json({ valid: false, reason: 'not_found' });
    }

    if (data.status === 'used') {
      return res.status(200).json({ valid: false, reason: 'already_used' });
    }

    if (data.status === 'expired') {
      return res.status(200).json({ valid: false, reason: 'expired' });
    }

    return res.status(200).json({
      valid: true,
      token_id: data.id,
      type: data.type   // 'free' | 'paid'
    });
  }

  // ============================================================
  // POST /api/token
  // 受診完了後にトークンを使用済みにする
  // body: { token_id: 'F001', respondent_id: 'uuid' }
  // ============================================================
  if (req.method === 'POST') {
    const { token_id, respondent_id } = req.body;

    if (!token_id) {
      return res.status(400).json({ success: false, reason: 'token_missing' });
    }

    const { error } = await supabase
      .from('tokens')
      .update({
        status: 'used',
        used_at: new Date().toISOString()
      })
      .eq('id', token_id.toUpperCase())
      .eq('status', 'unused');  // 未使用のものだけ更新（二重送信防止）

    if (error) {
      return res.status(500).json({ success: false, reason: 'db_error' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

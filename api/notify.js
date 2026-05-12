export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const data = req.body;
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.NOTIFY_EMAIL;

    // 環境変数なければ無視（診断には影響しない）
    if (!apiKey || !toEmail) return res.status(200).json({ ok: true });

    const d = data;
    const subject = `【Spec-V新規診断】${d.type_name || '?'} / ${d.age || '?'} / ${d.industry || '?'}`;

    const body = `
新規診断が完了しました。

■ 基本情報
日時：${d.timestamp}
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

■ 全データJSON（PDF生成用）
${JSON.stringify(d, null, 2)}
`.trim();

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Spec-V <noreply@resend.dev>',
        to: [toEmail],
        subject,
        text: body,
      }),
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('notify error:', err);
    return res.status(200).json({ ok: true }); // 失敗しても診断に影響させない
  }
}

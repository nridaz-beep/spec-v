const { verifyTokenClaim } = require('./_token-claim');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const localDev = !process.env.VERCEL && process.env.NODE_ENV !== 'production' && req.headers['x-specv-dev'] === '1';
  const tokenId = String(req.headers['x-specv-token'] || '').trim().toUpperCase();
  if (!localDev && !verifyTokenClaim(req.headers['x-specv-claim'], tokenId).valid) {
    return res.status(401).json({ error: 'diagnosis_session_required' });
  }

  try {
    const { model, max_tokens, messages } = req.body;
    const promptText = Array.isArray(messages)
      ? messages.map((message) => typeof message?.content === 'string' ? message.content : '').join('\n')
      : '';
    const standardTags = [
      ['CURRENT_STATE', 'POTENTIAL', 'CHECK_POINTS', 'INTERVIEW_QUESTIONS', 'ONBOARDING_SUPPORT', 'OVERALL'],
      ['SUMMARY', 'GROWTH', 'CAUTION', 'ACTIVATION', 'OVERALL'],
      ['SUMMARY', 'STRENGTH', 'HONEST', 'NEXT', 'OVERALL'],
    ];
    const requiredTags = standardTags.find((tags) => tags.every((tag) => promptText.includes(`【${tag}】`)));
    const isStandardOutput = Boolean(requiredTags);
    const effectiveMaxTokens = isStandardOutput ? 3000 : max_tokens;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: effectiveMaxTokens, messages }),
    });

    const data = await response.json();

    if (!response.ok) {
      const providerType = data?.error?.type || 'unknown_error';
      const providerMessage = data?.error?.message || 'Anthropic API request failed';
      console.error('[analyze] Anthropic request failed', {
        status: response.status,
        type: providerType,
        message: providerMessage,
      });
      return res.status(502).json({
        error: 'ai_provider_error',
        code: 'ANTHROPIC_REQUEST_FAILED',
        message: 'AIプロバイダーへのリクエストに失敗しました。',
      });
    }

    const textBlock = Array.isArray(data?.content)
      ? data.content.find((block) => block?.type === 'text' && typeof block      if (!officialStress) {
        console.error('[analyze] Standard output missing official stress context');
        return res.status(502).json({
          error: 'ai_provider_error',
          code: 'AI_STRESS_CONTEXT_MISSING',
          message: '正式なストレス反応がAI入力に含まれていません。',
        });
      }

      const mismatchedStressLabels = stressLabels.filter((label) => label !== officialStress && textBlock.text.includes(label));
      if (!textBlock.text.includes(officialStress) || mismatchedStressLabels.length) {
        console.error('[analyze] Standard output stress mismatch', {const promptText = Array.isArray(messages)
const stressLabels = ['強引・独断', '石頭・拒絶', '抱え込み・献身疲れ', '逃避・放棄'];
const stressMatch = promptText.match(/【正式なストレス反応】\s*([^\r\n]+)/);
const officialStress = stressMatch ? stressMatch[1].trim() : '';
          official_stress: officialStress,
          mismatched_stress: mismatchedStressLabels,
        });
        return res.status(502).json({
          error: 'ai_provider_error',
          code: 'AI_STRESS_MISMATCH',
          message: 'AI標準アウトプットのストレス反応が正式判定と一致しません。',
        });
      }

const missingTags = requiredTags.filter((tag) => !textBlock.text.includes(`【${tag}】`));const missingTags /*stress*/.text === 'string' && block.text.trim())
      : null;

    if (!textBlock) {
      console.error('[analyze] Anthropic response contained no text block', {
        stop_reason: data?.stop_reason || null,
        content_types: Array.isArray(data?.content)
          ? data.content.map((block) => block?.type || 'unknown')
          : [],
      });
      return res.status(502).json({
        error: 'ai_provider_error',
        code: 'ANTHROPIC_EMPTY_TEXT',
        message: 'AIプロバイダーから本文を取得できませんでした。',
      });
    }

    if (isStandardOutput) {
      const stopReason = data?.stop_reason || null;
      if (stopReason === 'max_tokens') {
        console.error('[analyze] Standard output truncated', {
          stop_reason: stopReason,
          max_tokens: effectiveMaxTokens,
        });
        return res.status(502).json({
          error: 'ai_provider_error',
          code: 'AI_OUTPUT_TRUNCATED',
          message: 'AI標準アウトプットが上限で途中終了しました。',
        });
      }

      const missingTags = requiredTags.filter((tag) => !textBlock.text.includes(`【${tag}】`));
      const endsLikeCompleteText = /[。．.!！？」』】）)]\s*$/.test(textBlock.text);
      if (stopReason !== 'end_turn' || missingTags.length || !endsLikeCompleteText) {
        console.error('[analyze] Standard output incomplete', {
          stop_reason: stopReason,
          missing_tags: missingTags,
          ends_like_complete_text: endsLikeCompleteText,
        });
        return res.status(502).json({
          error: 'ai_provider_error',
          code: 'AI_OUTPUT_INCOMPLETE',
          message: 'AI標準アウトプットが完全な形式で完了しませんでした。',
        });
      }
    }

    return res.status(200).json({
      ...data,
      content: [{ type: 'text', text: textBlock.text }],
    });
  } catch (error) {
    console.error('[analyze] Unexpected server error', error);
    return res.status(500).json({
      error: 'ai_provider_error',
      code: 'ANALYZE_SERVER_ERROR',
      message: 'AI分析処理で予期しないエラーが発生しました。',
    });
  }
};

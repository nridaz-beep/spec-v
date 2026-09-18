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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, messages }),
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
      ? data.content.find((block) => block?.type === 'text' && typeof block.text === 'string' && block.text.trim())
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

    // Keep the response shape expected by the existing clients while making
    // the selected text block independent of Anthropic content-block order.
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

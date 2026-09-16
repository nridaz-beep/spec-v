const crypto = require('node:crypto');

const CLAIM_TTL_SECONDS = 2 * 60 * 60;

function secret() {
  return process.env.TOKEN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.ADMIN_PASSWORD || '';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function issueTokenClaim(tokenId, type) {
  if (!secret()) return null;
  const payload = Buffer.from(JSON.stringify({
    token_id: String(tokenId).trim().toUpperCase(),
    type: String(type || ''),
    exp: Math.floor(Date.now() / 1000) + CLAIM_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString('hex')
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyTokenClaim(claim, tokenId) {
  if (!secret() || typeof claim !== 'string') return { valid: false, reason: 'claim_missing' };
  const [payload, signature] = claim.split('.');
  if (!payload || !signature) return { valid: false, reason: 'claim_invalid' };
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { valid: false, reason: 'claim_invalid' };
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.token_id !== String(tokenId).trim().toUpperCase()) return { valid: false, reason: 'claim_mismatch' };
    if (!Number.isFinite(data.exp) || data.exp < Math.floor(Date.now() / 1000)) return { valid: false, reason: 'claim_expired' };
    return { valid: true, data };
  } catch {
    return { valid: false, reason: 'claim_invalid' };
  }
}

module.exports = { issueTokenClaim, verifyTokenClaim };

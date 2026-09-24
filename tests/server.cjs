// Test-only server: real application handlers, isolated external service boundaries.
// Never imported by api/* or deployed. No production credentials are read.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.TEST_PORT || 4173);
Object.assign(process.env, {
  NODE_ENV: 'production', VERCEL: '1', SUPABASE_URL: `http://127.0.0.1:${port}`,
  SUPABASE_SERVICE_ROLE_KEY: 'isolated-test-service-key', SUPABASE_SERVICE_KEY: '',
  SUPABASE_ANON_KEY: '', TOKEN_SESSION_SECRET: 'isolated-test-claim-secret',
  ADMIN_PASSWORD: 'isolated-admin', ANTHROPIC_API_KEY: 'isolated-ai',
  RESEND_API_KEY: 'isolated-mail', NOTIFY_EMAIL: 'nobody@example.invalid',
});
let state;
function reset(options = {}) {
  state = { tokens: ['P-E2E', 'F-REGULAR', 'F-TEST'].map(id => ({
    id, type: id.startsWith('P') ? 'paid' : 'free', status: 'unused', used_at: null,
    issued_at: '2026-01-01T00:00:00.000Z', note: id === 'F-TEST' ? 'E2E_TEST' : '', org_id: null,
  })), ai: [], notifications: [], mails: [], updates: [], aiFailures: 0, dbFailures: 0, ...options };
}
reset();
const nativeFetch = global.fetch;
global.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === 'https://api.anthropic.com/v1/messages') {
    const body = JSON.parse(init.body); state.ai.push(body);
    if (state.aiFailures > 0) { state.aiFailures--; return Response.json({ error: { type: 'overloaded_error' } }, { status: 529 }); }
    if (state.aiEmpty) return Response.json({ content: [], stop_reason: 'end_turn' });
    const prompt = body.messages.map(x => x.content).join('\n');
    const tags = prompt.includes('【INSIGHT_1】')
      ? ['INSIGHT_1','INSIGHT_2','INSIGHT_3','ACTION_DO','ACTION_STOP','ACTION_ENV']
      : prompt.includes('【CURRENT_STATE】') ? ['CURRENT_STATE','POTENTIAL','CHECK_POINTS','INTERVIEW_QUESTIONS','ONBOARDING_SUPPORT','OVERALL']
      : prompt.includes('【GROWTH】') ? ['SUMMARY','GROWTH','CAUTION','ACTIVATION','OVERALL']
      : ['SUMMARY','STRENGTH','HONEST','NEXT','OVERALL'];
    const stress = prompt.match(/ストレス反応：([^\n]+)/)?.[1]?.trim() || '';
    const sentence = `${stress}という反応にも注意しながら、周囲の意見を聴いて自分の考えを具体的な行動に移しています。次の仕事では目的と期限を共有し、進捗を確認してください。`;
    return Response.json({ content: [{ type: 'text', text: tags.map(tag => `【${tag}】${sentence.repeat(state.longAI ? 6 : 2)}`).join('\n') }], stop_reason: state.aiTruncated ? 'max_tokens' : 'end_turn' });
  }
  if (url === 'https://api.resend.com/emails') {
    state.mails.push(JSON.parse(init.body)); return Response.json({ id: 'isolated-mail' });
  }
  if (url.startsWith(`http://127.0.0.1:${port}/`)) return nativeFetch(input, init);
  throw new Error(`Unexpected external request blocked: ${new URL(url).origin}`);
};
const handlers = Object.fromEntries(['token','analyze','notify','admin-tokens','admin-departments'].map(name => [name, require(path.join(root, 'api', name + '.js'))]));
const server = http.createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  req.query = Object.fromEntries(url.searchParams);
  let raw = ''; for await (const chunk of req) raw += chunk;
  try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
  try {
    if (url.pathname === '/__test/shutdown' && req.method === 'POST') { res.json({ ok: true }); setTimeout(() => { server.closeAllConnections(); server.close(); }, 50); return; }
    if (url.pathname === '/__test/reset' && req.method === 'POST') { reset(req.body); return res.json({ ok: true }); }
    if (url.pathname === '/__test/state') return res.json(state);
    if (url.pathname === '/__test/options' && req.method === 'POST') { Object.assign(state, req.body); return res.json({ ok: true }); }
    if (url.pathname === '/__test/admin-config' && req.method === 'POST') { process.env.ADMIN_PASSWORD = req.body.enabled ? 'isolated-admin' : ''; return res.json({ ok: true }); }
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').pop();
      if (table !== 'tokens') return res.json([]);
      let rows = state.tokens.filter(row => [...url.searchParams].every(([key,value]) => {
        if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
        if (value.startsWith('in.(')) return value.slice(4,-1).split(',').includes(row[key]);
        if (value === 'is.null') return row[key] == null;
        return true;
      }));
      if (req.method === 'PATCH') {
        if (state.dbFailures > 0) { state.dbFailures--; return res.status(500).json({ code: 'XX000', message: 'Injected database failure' }); }
        rows.forEach(row => Object.assign(row, req.body)); state.updates.push({ body: req.body, rows: rows.map(x=>x.id) });
      }
      const fields = url.searchParams.get('select');
      if (fields && fields !== '*') rows = rows.map(row => Object.fromEntries(fields.split(',').map(key => [key, row[key] ?? null])));
      if (req.headers.accept?.includes('vnd.pgrst.object')) return rows.length === 1 ? res.json(rows[0]) : res.status(406).json({ code: 'PGRST116', details: 'The result contains 0 rows' });
      return res.json(rows);
    }
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5);
      if (!handlers[name]) return res.status(404).json({ error: 'unknown_api' });
      if (name === 'notify') state.notifications.push(req.body);
      return await handlers[name](req, res);
    }
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/main.html' : url.pathname));
    if (url.pathname === '/__test/chart.js') file = path.join(root, 'node_modules/chart.js/dist/chart.umd.js');
    else if (!file.startsWith(root + path.sep) || !/\.(html|css|js)$/.test(file) || url.pathname.includes('/tests/') || url.pathname.includes('/node_modules/')) return res.status(404).end();
    if (!fs.existsSync(file)) return res.status(404).end();
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(fs.readFileSync(file));
  } catch (error) { console.error(error); res.status(500).json({ error: error.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Isolated E2E server on ${port}`));

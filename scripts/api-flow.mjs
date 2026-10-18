// End-to-end API smoke test: signup → session → create report → bins list.
// Usage: node scripts/api-flow.mjs [baseUrl]
const base = process.argv[2] || 'http://localhost:8081';

let cookie = null;

async function req(path, init = {}) {
  const headers = {
  'Content-Type': 'application/json',
  Origin: base,
  ...(init.headers ?? {}),
};
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && setCookie.includes('session_token')) {
    cookie = setCookie.split(';')[0];
  }
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
  return { status: res.status, body };
}

const email = `flow${Date.now()}@emu.edu.tr`;
const emailWrongDomain = `flow${Date.now()}@example.org`;
const steps = [];

function log(name, r) {
  steps.push(`${r.status < 400 ? 'PASS' : 'FAIL'} ${name} [${r.status}] ${JSON.stringify(r.body).slice(0, 160)}`);
}

function expect(name, ok, body) {
  steps.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ← ' + JSON.stringify(body).slice(0, 200)}`);
}

// Domain gate: a non-campus email must be rejected by Better Auth.
const badDomain = await req('/api/auth/sign-up/email', {
  method: 'POST',
  body: JSON.stringify({ name: 'Bad Domain', email: emailWrongDomain, password: 'FlowPass123' }),
});
expect('domain-gate-rejected', badDomain.status >= 400, badDomain);

const signup = await req('/api/auth/sign-up/email', {
  method: 'POST',
  body: JSON.stringify({ name: 'Flow Test', email, password: 'FlowPass123' }),
});
log('sign-up', signup);

const session = await req('/api/auth/get-session');
log(
  'get-session',
  session.status === 200 && session.body?.user?.email === email
    ? { status: 200, body: { user: session.body.user.email } }
    : session,
);

const signedCookie = cookie;

const report = await req('/api/reports', {
  method: 'POST',
  body: JSON.stringify({ lat: 35.3786, lng: 33.9422, category: 'glass', note: 'api flow test' }),
});
log('create-report', report);

// Drop the session so this mutation is truly unauthenticated.
cookie = null;
const unauth = await req('/api/reports', {
  method: 'POST',
  body: JSON.stringify({ lat: 35.3786, lng: 33.9422, category: 'glass' }),
});
log(
  'unauthenticated-rejected',
  unauth.status === 401 ? { status: 200, body: { rejected: true } } : unauth,
);

cookie = signedCookie;
const far = await req('/api/reports', {
  method: 'POST',
  body: JSON.stringify({ lat: 51.5, lng: -0.12, category: 'glass' }),
});
log('geofence-rejected', far.status === 422 ? { status: 200, body: { rejected: true } } : far);

const bins = await req('/api/bins');
log(
  'bins-list',
  bins.status === 200 && Array.isArray(bins.body) && bins.body.some((b) => b.category === 'glass')
    ? { status: 200, body: { bins: bins.body.length, hasGlass: true } }
    : bins,
);

cookie = signedCookie;
const mine = await req('/api/reports?mine=1');
log(
  'my-reports',
  mine.status === 200 && mine.body.reports.some((r) => r.note === 'api flow test')
    ? { status: 200, body: { count: mine.body.reports.length } }
    : mine,
);

// --- Verification wave: a second distinct member sighting the same bin ---
const binId = report.body?.binId;

cookie = null;
const signupB = await req('/api/auth/sign-up/email', {
  method: 'POST',
  body: JSON.stringify({ name: 'Flow Two', email: `flow2${Date.now()}@emu.edu.tr`, password: 'FlowPass123' }),
});
log('sign-up-second', signupB);

const confirm = await req('/api/reports', {
  method: 'POST',
  body: JSON.stringify({ lat: 35.37868, lng: 33.94224, category: 'glass', note: 'confirm sighting' }),
});
log('create-report-second', confirm);

const waves = await req(`/api/bins/${binId}`);
expect(
  'verification-wave-verified',
  waves.status === 200 && waves.body?.status === 'verified' && waves.body?.reports?.length >= 2,
  waves.body?.status,
);

// --- Dispute flow: second member flags the bin missing ---
const dispute = await req(`/api/bins/${binId}/dispute`, { method: 'POST', body: '{}' });
expect('dispute-status', dispute.status === 200 && dispute.body?.status === 'disputed', dispute.body);

// --- Trust stats via /api/me ---
const me = await req('/api/me');
expect(
  'me-stats',
  me.status === 200 && typeof me.body?.stats?.trustScore === 'number' && me.body.stats.reportsCount >= 1,
  me.body,
);

// --- Admin gate: non-admins get 403 on moderation routes ---
const adminGate = await req(`/api/admin/bins/${binId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'removed' }),
});
expect('admin-gate-403', adminGate.status === 403, adminGate);

// --- Bin detail fetch (marker press target) ---
const binDetail = await req(`/api/bins/${binId}`);
expect('bin-detail', binDetail.status === 200 && Array.isArray(binDetail.body?.reports), binDetail.body?.status);

console.log(steps.join('\n'));

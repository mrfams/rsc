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
const steps = [];

function log(name, r) {
  steps.push(`${r.status < 400 ? 'PASS' : 'FAIL'} ${name} [${r.status}] ${JSON.stringify(r.body).slice(0, 160)}`);
}

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

console.log(steps.join('\n'));

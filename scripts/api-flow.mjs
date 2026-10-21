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
  const detail = body === undefined ? 'undefined' : JSON.stringify(body)?.slice(0, 200) ?? String(body);
  steps.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ← ' + detail}`);
}

// Open sign-up: any email domain is accepted (no campus-email gate).
const openSignup = await req('/api/auth/sign-up/email', {
  method: 'POST',
  body: JSON.stringify({ name: 'Open Signup', email: emailWrongDomain, password: 'FlowPass123' }),
});
expect('open-signup-accepted', openSignup.status < 400, openSignup);

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

// Leaderboard is private by default: no public rank until the member allows it.
const mePrivate = await req('/api/me');
expect(
  'leaderboard-private-by-default',
  mePrivate.status === 200 &&
    mePrivate.body?.leaderboardOptIn === false &&
    mePrivate.body?.stats?.rank === null,
  {
    leaderboardOptIn: mePrivate.body?.leaderboardOptIn,
    rank: mePrivate.body?.stats?.rank,
  },
);

const allowBoard = await req('/api/me', {
  method: 'PATCH',
  body: JSON.stringify({ leaderboardOptIn: true }),
});
expect(
  'leaderboard-opt-in',
  allowBoard.status === 200 && allowBoard.body?.leaderboardOptIn === true,
  allowBoard.body,
);

const report = await req('/api/reports', {
  method: 'POST',
  body: JSON.stringify({ lat: 35.14472, lng: 33.90788, category: 'glass', note: 'api flow test' }),
});
log('create-report', report);

// Drop the session so this mutation is truly unauthenticated.
cookie = null;
const unauth = await req('/api/reports', {
  method: 'POST',
  body: JSON.stringify({ lat: 35.14472, lng: 33.90788, category: 'glass' }),
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
  body: JSON.stringify({ lat: 35.14477, lng: 33.90783, category: 'glass', note: 'confirm sighting' }),
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

// --- Points + leaderboard via /api/me ---
const me = await req('/api/me');
expect(
  'me-points-and-rank',
  me.status === 200 &&
    typeof me.body?.stats?.points === 'number' &&
    me.body.stats.points > 0 &&
    typeof me.body.stats.rank === 'number' &&
    me.body.stats.rank >= 1 &&
    Array.isArray(me.body.stats.leaderboard) &&
    me.body.stats.leaderboard.some((row) => row.isYou === true) &&
    me.body.stats.reportsCount >= 1,
  me.body?.stats,
);

const publicBoard = await req('/api/leaderboard');
expect(
  'leaderboard-top10-shared-only',
  publicBoard.status === 200 &&
    Array.isArray(publicBoard.body?.rows) &&
    publicBoard.body.rows.some((row) => row.isYou === true) &&
    publicBoard.body.rows.every((row) => row.name && typeof row.points === 'number'),
  publicBoard.body,
);

// Opting out hides the rank and the name again.
const leaveBoard = await req('/api/me', {
  method: 'PATCH',
  body: JSON.stringify({ leaderboardOptIn: false }),
});
expect(
  'leaderboard-opt-out',
  leaveBoard.status === 200 && leaveBoard.body?.leaderboardOptIn === false,
  leaveBoard.body,
);
const mePrivateAgain = await req('/api/me');
expect(
  'leaderboard-hidden-after-opt-out',
  mePrivateAgain.body?.leaderboardOptIn === false && mePrivateAgain.body?.stats?.rank === null,
  { optIn: mePrivateAgain.body?.leaderboardOptIn, rank: mePrivateAgain.body?.stats?.rank },
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

// --- Push registration: invalid tokens rejected, valid-shaped accepted ---
const pushBad = await req('/api/push/register', {
  method: 'POST',
  body: JSON.stringify({ token: 'not-a-push-token', platform: 'android' }),
});
expect('push-register-invalid', pushBad.status === 400, pushBad.body);

const pushOk = await req('/api/push/register', {
  method: 'POST',
  body: JSON.stringify({
    token: `ExponentPushToken[flow-test-${Date.now()}]`,
    platform: 'android',
  }),
});
expect('push-register-valid', pushOk.status === 200 && pushOk.body?.registered === true, pushOk.body);

// --- Campus config: full multipolygon is exposed ---
const publicConfig = await req('/api/config');
expect(
  'config-multipolygon',
  publicConfig.status === 200 &&
    Array.isArray(publicConfig.body?.campusPolygons) &&
    publicConfig.body.campusPolygons.length >= 3 &&
    publicConfig.body.campusPolygons[0].length > 30,
  {
    rings: publicConfig.body?.campusPolygons?.length,
    points: publicConfig.body?.campusPolygons?.[0]?.length,
  },
);

// --- Admin map studio: sign in, name a bin, move it, remove it ---
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'ft@rsc.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ft@rsc123';
cookie = null;
const adminLogin = await req('/api/auth/sign-in/email', {
  method: 'POST',
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
expect('admin-sign-in', adminLogin.status < 400, adminLogin.body);

const adminMe = await req('/api/me');
expect('admin-flag', adminMe.status === 200 && adminMe.body?.isAdmin === true, adminMe.body);

const campusAdmin = await req('/api/admin/campus');
expect(
  'admin-campus-multipolygon',
  campusAdmin.status === 200 &&
    Array.isArray(campusAdmin.body?.campusPolygons) &&
    campusAdmin.body.campusPolygons.length >= 3,
  campusAdmin.body?.campusPolygons?.length,
);

// --- Bin types: create a throwaway type and delete it again ---
const typeSlug = `flow_type_${Date.now()}`;
const createdType = await req('/api/admin/categories', {
  method: 'POST',
  body: JSON.stringify({ slug: typeSlug, name: 'Flow Type', emoji: '🧪', color: '#0E7C5A' }),
});
expect(
  'admin-create-type',
  createdType.status === 201 && createdType.body?.slug === typeSlug,
  createdType.body,
);

const deletedType = await req('/api/admin/categories', {
  method: 'DELETE',
  body: JSON.stringify({ slug: typeSlug }),
});
expect(
  'admin-delete-type',
  deletedType.status === 200 && deletedType.body?.ok === true,
  deletedType.body,
);

const createdBin = await req('/api/admin/bins', {
  method: 'POST',
  body: JSON.stringify({
    name: 'API Test Bin',
    category: 'glass',
    lat: 35.14472,
    lng: 33.90788,
    status: 'verified',
  }),
});
expect(
  'admin-create-named-bin',
  createdBin.status === 201 && createdBin.body?.name === 'API Test Bin',
  createdBin.body,
);

if (createdBin.body?.id) {
  const renamed = await req(`/api/admin/bins/${createdBin.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'API Test Bin Renamed',
      lat: 35.14475,
      lng: 33.9079,
      status: 'disputed',
    }),
  });
  expect(
    'admin-edit-named-bin',
    renamed.status === 200 &&
      renamed.body?.name === 'API Test Bin Renamed' &&
      renamed.body?.status === 'disputed' &&
      Math.abs(renamed.body?.lat - 35.14475) < 1e-6,
    renamed.body,
  );

  const removed = await req(`/api/admin/bins/${createdBin.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'removed' }),
  });
  expect('admin-remove-bin', removed.status === 200 && removed.body?.status === 'removed', removed.body);
}

console.log(steps.join('\n'));

/**
 * Unit tests for the native API base resolver (no test framework in this repo;
 * run with: npx tsx scripts/api-base.test.ts).
 */
import assert from 'node:assert/strict';

import { originFromHostUri, resolveApiBase } from '../src/lib/api-base';

const cases: { name: string; run: () => void }[] = [
  {
    name: 'web is always same-origin',
    run: () =>
      assert.equal(
        resolveApiBase({ platform: 'web', apiUrl: 'https://example.com' }),
        '',
      ),
  },
  {
    name: 'physical dev build with baked localhost uses Metro LAN address',
    run: () =>
      assert.equal(
        resolveApiBase({
          platform: 'android',
          apiUrl: 'http://localhost:8081',
          hostUri: '192.168.1.7:8081',
        }),
        'http://192.168.1.7:8081',
      ),
  },
  {
    name: 'signed build always uses the configured deployed server',
    run: () =>
      assert.equal(
        resolveApiBase({
          platform: 'ios',
          apiUrl: 'https://emu-bin-tracker.vercel.app',
          hostUri: '192.168.1.7:8081',
        }),
        'https://emu-bin-tracker.vercel.app',
      ),
  },
  {
    name: 'deployed URL trailing slash is stripped',
    run: () =>
      assert.equal(
        resolveApiBase({ platform: 'android', apiUrl: 'https://emu-bin-tracker.vercel.app/' }),
        'https://emu-bin-tracker.vercel.app',
      ),
  },
  {
    name: 'simulator with localhost hostUri keeps localhost',
    run: () =>
      assert.equal(
        resolveApiBase({ platform: 'ios', apiUrl: 'http://localhost:8081', hostUri: 'localhost:8081' }),
        'http://localhost:8081',
      ),
  },
  {
    name: 'no configuration at all falls back to localhost',
    run: () =>
      assert.equal(resolveApiBase({ platform: 'android' }), 'http://localhost:8081'),
  },
  {
    name: 'IPv6 hostUri is preserved',
    run: () =>
      assert.equal(originFromHostUri('[::1]:8081'), 'http://[::1]:8081'),
  },
  {
    name: 'hostUri without a port is unusable',
    run: () => assert.equal(originFromHostUri('192.168.1.7'), null),
  },
  {
    name: 'empty hostUri is unusable',
    run: () => assert.equal(originFromHostUri('   '), null),
  },
];

let failed = 0;
for (const test of cases) {
  try {
    test.run();
    console.log(`ok   ${test.name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${test.name}`);
    console.error(err);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed > 0) process.exit(1);

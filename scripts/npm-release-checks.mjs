import assert from 'node:assert/strict';
import { test } from 'node:test';
import { release } from './npm-release.mjs';

const metadata = { name: '@glidemq/nestjs', version: '0.5.1' };
const packed = { ...metadata, shasum: 'expected' };
function harness(status, published) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      assert.equal(url, 'https://registry.npmjs.org/%40glidemq%2Fnestjs/0.5.1');
      assert.ok(options.signal);
      assert.equal(options.headers.authorization, undefined);
      return { status, ok: status === 200, json: async () => published };
    },
    run: (command, args) => {
      calls.push([command, args]);
      return JSON.stringify([packed]);
    },
  };
}
test('missing release publishes once; verification requests a bounded retry without publishing', async () => {
  const h = harness(404);
  assert.equal(await release('publish', metadata, h.fetch, h.run), 0);
  assert.deepEqual(h.calls[1], ['npm', ['publish', '--access', 'public', '--ignore-scripts', '--provenance']]);
  const v = harness(404);
  assert.equal(await release('verify', metadata, v.fetch, v.run), 75);
  assert.equal(v.calls.length, 1);
});
test('matching existing artifact is verified without duplicate publication', async () => {
  for (const mode of ['publish', 'verify']) {
    const h = harness(200, { ...metadata, dist: { shasum: 'expected' } });
    assert.equal(await release(mode, metadata, h.fetch, h.run), 0);
    assert.equal(h.calls.length, 1);
  }
});
test('mismatched existing artifacts and registry failures fail closed', async () => {
  for (const published of [
    { ...metadata, dist: { shasum: 'different' } },
    { ...metadata, version: '0.5.0', dist: { shasum: 'expected' } },
  ]) {
    const h = harness(200, published);
    await assert.rejects(release('publish', metadata, h.fetch, h.run), /does not match/);
    assert.equal(h.calls.length, 1);
  }
  const h = harness(403);
  await assert.rejects(release('publish', metadata, h.fetch, h.run), /HTTP 403/);
  assert.equal(h.calls.length, 1);
});

// Guard the publication race that caused false failures after a successful publish.
test('workflow verifies propagation with bounded retries and idempotent publication', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: node scripts\/npm-release\.mjs publish/);
  assert.match(workflow, /retry_on_exit_code: 75/);
  assert.match(workflow, /max_attempts: 30/);
  assert.match(workflow, /timeout_seconds: 15/);
  assert.match(workflow, /command: node scripts\/npm-release\.mjs verify/);
  assert.doesNotMatch(workflow, /sleep 10/);
});

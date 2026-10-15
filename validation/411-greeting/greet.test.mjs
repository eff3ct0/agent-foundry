import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import test from 'node:test';

function greet(...args) {
  return spawnSync(process.execPath, [new URL('./greet.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });
}

test('greets the recipient while preserving internal spacing and Unicode', () => {
  const result = greet('  Zoë  王  ');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'Hello, Zoë  王!\n');
  assert.equal(result.stderr, '');
});

test('rejects missing, blank and extra recipients with a usage error', () => {
  for (const args of [[], [' \t '], ['Ada', 'Grace']]) {
    const result = greet(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Usage: node greet.mjs NAME\n');
  }
});

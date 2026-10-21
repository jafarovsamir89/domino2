import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInfo } from '../src/build-info.js';
test('API release exposes the deploy SHA without accepting arbitrary environment strings', () => {
  assert.equal(buildInfo({ GITHUB_SHA: 'ABCDEF012345' }).deploySha, 'abcdef012345');
  assert.equal(buildInfo({ DEPLOY_SHA: 'private-value' }).deploySha, 'unknown');
  assert.equal(buildInfo({}).release, 'domino-platform-api@unknown');
});

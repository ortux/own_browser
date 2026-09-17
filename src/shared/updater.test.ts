import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareVersions,
  initialUpdateInfo,
  parseReleaseChannel,
  userFacingUpdateError,
} from './updater';

test('compares dotted application versions numerically', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('2.0.0', '2.0'), 0);
  assert.equal(compareVersions('1.2.0-beta.1', '1.2.0'), 0);
  assert.equal(compareVersions('0.9.0', '1.0.0'), -1);
});

test('only accepts supported release channels', () => {
  assert.equal(parseReleaseChannel('stable'), 'stable');
  assert.equal(parseReleaseChannel('beta'), 'beta');
  assert.equal(parseReleaseChannel('dev'), 'dev');
  assert.equal(parseReleaseChannel('production'), 'stable');
  assert.equal(parseReleaseChannel(undefined), 'stable');
});

test('initial state does not claim an update exists', () => {
  assert.deepEqual(initialUpdateInfo('1.4.0', 'stable'), {
    state: 'idle',
    currentVersion: '1.4.0',
    channel: 'stable',
  });
});

test('sanitizes updater failures into stable UI messages', () => {
  assert.deepEqual(userFacingUpdateError(new Error('sha512 checksum mismatch')), {
    code: 'VERIFICATION_FAILED',
    message: 'The downloaded update could not be verified.',
  });
  assert.deepEqual(userFacingUpdateError(new Error('ENOTFOUND update host')), {
    code: 'NETWORK_UNAVAILABLE',
    message: 'The update server is unavailable. Try again later.',
  });
  assert.equal(userFacingUpdateError(new Error('unexpected failure')).code, 'UPDATE_FAILED');
});

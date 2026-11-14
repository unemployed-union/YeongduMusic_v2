const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');

const jsx = (type, props) => ({ type, props });
let legacyLoads = 0;
const boundaries = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/features/settings/settings-navigator': { SettingsNavigator: 'ExistingSettingsNavigator' },
};

// Old native binaries may still contain the retired module. Settings must not
// load its JS anchor or start its background driver.
Object.defineProperty(boundaries, '@/features/settings/settings-sheet-background', {
  get() {
    legacyLoads++;
    throw new Error('The retired sheet background must never be mounted');
  },
});

const layout = loadSource('src/app/(settings)/_layout.tsx', boundaries);
assert.equal(layout.default().type, 'ExistingSettingsNavigator');
assert.equal(layout.unstable_settings.anchor, 'settings/index');
assert.equal(legacyLoads, 0);

console.log('PASS: settings mount the existing navigator directly without loading a custom background driver, including on old native binaries. UIKit system rendering is not tested by this mocked check.');

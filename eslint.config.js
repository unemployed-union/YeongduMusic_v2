const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*']),
  expoConfig,
  {
    files: ['scripts/**/*.{cjs,js}', 'plugins/**/*.js'],
    languageOptions: { globals: { __dirname: 'readonly', Buffer: 'readonly' } },
    // Regression scripts invoke hooks through an explicit simulated React runtime.
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }],
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]);

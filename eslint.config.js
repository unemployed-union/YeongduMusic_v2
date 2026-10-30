const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*']),
  expoConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      curly: ['error', 'all'],
      'one-var': ['error', 'never'],
      'no-nested-ternary': 'error',
      'no-multi-assign': 'error',
      'max-statements-per-line': ['error', { max: 1 }],
    },
  },
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

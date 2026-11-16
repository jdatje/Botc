// npm run lint: catches names that don't exist (a missing import after moving code between modules)
// and writes to another module's state (app.js owns the client state; use its set… functions).
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-import-assign': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
  { files: ['public/**/*.js'], languageOptions: { globals: { ...globals.browser, io: 'readonly' } } },
  { files: ['public/sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
];

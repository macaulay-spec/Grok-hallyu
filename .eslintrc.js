module.exports = {
  root: true,
  extends: ['expo'],
  // `supabase/functions/` runs on Deno, not in the Expo/Metro toolchain: it imports through jsr: and
  // uses Deno globals, so both eslint and tsc exclude it (see tsconfig.json). The migrations, seed,
  // config and the type contract under supabase/ ARE linted/typechecked.
  ignorePatterns: [
    'dist/',
    'android/',
    'ios/',
    'node_modules/',
    '.expo/',
    'babel.config.js',
    'eslint.config.js',
    'supabase/functions/',
  ],
  rules: {
    'no-unused-vars': 'off',
  },
};
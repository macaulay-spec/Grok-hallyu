module.exports = {
  root: true,
  extends: ['expo'],
  // `backend/` is the parked server code (see backend/README.md) — out of the app and out of the lint
  // run, because it still targets the Supabase client and the schema, not this build.
  ignorePatterns: ['dist/', 'android/', 'ios/', 'node_modules/', '.expo/', 'babel.config.js', 'eslint.config.js', 'supabase/', 'backend/'],
  rules: {
    // demo data intentionally uses non-uuid-safe literals in a few places
    'no-unused-vars': 'off',
  },
};

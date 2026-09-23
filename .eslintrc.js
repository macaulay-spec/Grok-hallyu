module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['dist/', 'android/', 'ios/', 'node_modules/', '.expo/', 'babel.config.js', 'eslint.config.js', 'supabase/'],
  rules: {
    // demo data intentionally uses non-uuid-safe literals in a few places
    'no-unused-vars': 'off',
  },
};

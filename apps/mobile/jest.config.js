/** Unit and component tests (SPEC 30.2). Repository tests use a real SQLite database through better-sqlite3. */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/test/setup.ts'],
  testMatch: ['<rootDir>/test/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Jest picks lucide's React Native entry, an .mjs file it cannot load; Node's resolution gives the CommonJS build.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
};

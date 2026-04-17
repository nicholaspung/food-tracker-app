const path = require('path');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^pocketbase$': path.resolve(__dirname, '../../node_modules/pocketbase/dist/pocketbase.es.js'),
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|native-base|pocketbase))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};

/** @type {import('knip').KnipConfig} */
const config = {
  entry: [
    // Served directly by the screenshot review HTML shell.
    'e2e/review-ui/app.js',
    // Required dynamically from App.tsx and swapped by Metro in production bundles.
    'src/dev/screenshotReviewAuthBootstrap.ts',
  ],
  ignoreFiles: [
    // Metro resolves this stub only for production/dev-only module replacement.
    'src/dev/screenshotReviewAuthBootstrap.stub.ts',
  ],
  ignoreBinaries: [
    // These commands are provided by declared packages, but knip does not map all binary names back reliably.
    'eas',
    'expo',
    'jest',
    'tsc',
  ],
  ignoreDependencies: [
    // Tooling packages consumed through Expo/Babel/ESLint config or native build scripts.
    '@babel/core',
    '@posthog/cli',
    'eas-cli',
    'eslint',
    'eslint-config-expo',
    // Runtime and peer dependencies required by Expo web, React Navigation, PostHog, and QR rendering.
    'expo-device',
    'react-dom',
    'react-native-screens',
    'react-native-svg',
    'react-native-web',
  ],
};

module.exports = config;

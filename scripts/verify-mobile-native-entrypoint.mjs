import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertMissing(relativePath, errorMessage) {
  if (existsSync(path.join(repoRoot, relativePath))) {
    fail(errorMessage);
  }
}

function assertPresent(relativePath, errorMessage) {
  if (!existsSync(path.join(repoRoot, relativePath))) {
    fail(errorMessage);
  }
}

assertMissing(
  'ios',
  'Unexpected root ios/ project detected. Only apps/mobile/ios/YummyRecs should exist for iOS builds.'
);
assertMissing(
  'app.json',
  'Unexpected root app.json detected. Expo app configuration should live under apps/mobile only.'
);

const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const expectedScripts = {
  ios: 'pnpm mobile:ios',
  android: 'pnpm mobile:android',
};

for (const [scriptName, expectedValue] of Object.entries(expectedScripts)) {
  if (packageJson.scripts?.[scriptName] !== expectedValue) {
    fail(
      `package.json script "${scriptName}" must be "${expectedValue}" to avoid targeting a root Expo native project.`
    );
  }
}

assertPresent(
  'apps/mobile/ios/YummyRecs.xcodeproj/project.pbxproj',
  'Missing apps/mobile/ios/YummyRecs.xcodeproj/project.pbxproj.'
);

try {
  const configFactory = require(path.join(repoRoot, 'app.config.js'));

  if (typeof configFactory !== 'function') {
    fail('Root app.config.js must export a function that rejects repo-root Expo usage.');
  }

  configFactory();
  fail('Root app.config.js must reject Expo usage from the repo root.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (!message.includes('apps/mobile')) {
    fail(`Unexpected root app.config.js guard behavior: ${message}`);
  }
}

console.log('Mobile native entrypoint guard passed.');

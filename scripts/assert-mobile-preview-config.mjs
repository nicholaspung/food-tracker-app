#!/usr/bin/env node

const stdin = await readStdin();
const failures = [];

let config;
try {
  config = JSON.parse(stdin);
} catch (error) {
  fail(`Could not parse Expo config JSON from stdin: ${error.message}`);
}

const deployTarget = readOptionalEnvValue(process.env.MOBILE_DEPLOY_TARGET) ?? 'beta';
const appEnvironment = readOptionalEnvValue(process.env.EXPO_PUBLIC_APP_ENV);
const appVariant = readOptionalEnvValue(process.env.APP_VARIANT);
const expectedAppEnvironment = deployTarget === 'production' ? 'production' : 'beta';
const expectedRuntimeVersion = `${config.version}-preview-embedded-1`;

expectEqual('APP_VARIANT', appVariant, 'preview');
expectEqual('EXPO_PUBLIC_APP_ENV', appEnvironment, expectedAppEnvironment);
expectEqual('name', config.name, 'Yummy Recs Preview');
expectEqual('scheme', config.scheme, 'yummyrecs-preview');
expectEqual('ios.bundleIdentifier', config.ios?.bundleIdentifier, 'com.yummyrecs.mobile.preview');
expectEqual('runtimeVersion', config.runtimeVersion, expectedRuntimeVersion);
expectEqual('ios.runtimeVersion', config.ios?.runtimeVersion, expectedRuntimeVersion);
expectEqual('updates.checkAutomatically', config.updates?.checkAutomatically, 'ON_ERROR_RECOVERY');
expectEqual('updates.fallbackToCacheTimeout', config.updates?.fallbackToCacheTimeout, 0);
expectIncludes(
  'ios.associatedDomains',
  config.ios?.associatedDomains,
  'applinks:beta.app.yummyrecs.com',
);

if (!readOptionalEnvValue(config.updates?.url)) {
  failures.push('updates.url must be present.');
}

for (const [name, value] of [
  ['EXPO_PUBLIC_API_BASE_URL', process.env.EXPO_PUBLIC_API_BASE_URL],
  ['EXPO_PUBLIC_POCKETBASE_URL', process.env.EXPO_PUBLIC_POCKETBASE_URL],
  ['EXPO_PUBLIC_ADMIN_URL', process.env.EXPO_PUBLIC_ADMIN_URL],
  ['EXPO_PUBLIC_APP_WEB_URL', process.env.EXPO_PUBLIC_APP_WEB_URL],
  ['EXPO_PUBLIC_MARKETING_URL', process.env.EXPO_PUBLIC_MARKETING_URL],
  ['EXPO_PUBLIC_POSTHOG_HOST', process.env.EXPO_PUBLIC_POSTHOG_HOST],
]) {
  const normalizedValue = readOptionalEnvValue(value);
  if (normalizedValue && isLocalDevelopmentUrl(normalizedValue)) {
    failures.push(`${name} must not resolve to a local URL for ${expectedAppEnvironment}.`);
  }
}

if (failures.length > 0) {
  fail(`Mobile preview config assertion failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}

console.log(
  `Mobile preview config OK: ${config.name}, ${config.ios?.bundleIdentifier}, ${expectedAppEnvironment}.`,
);

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function expectIncludes(label, actual, expected) {
  if (!Array.isArray(actual) || !actual.includes(expected)) {
    failures.push(`${label} must include ${JSON.stringify(expected)}.`);
  }
}

function isLocalDevelopmentUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsedUrl.hostname);
  } catch {
    return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
  }
}

function readOptionalEnvValue(value) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileRoot = path.join(repoRoot, 'apps/mobile');
const failures = [];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function stripPbxValue(value) {
  return value.trim().replace(/^"|"$/g, '');
}

function parseTargetBuildSettings(projectText) {
  const configs = new Map();
  const configPattern =
    /\/\* (Debug|Release|ReleasePreview) \*\/ = \{[\s\S]*?buildSettings = \{([\s\S]*?)\n\s*\};\n\s*name = \1;/g;

  for (const match of projectText.matchAll(configPattern)) {
    const [, name, settingsText] = match;

    if (!settingsText.includes('PRODUCT_BUNDLE_IDENTIFIER')) {
      continue;
    }

    const settings = {};
    for (const line of settingsText.split('\n')) {
      const settingMatch = line.match(/^\s*([A-Z0-9_]+) = (.*);$/);
      if (settingMatch) {
        settings[settingMatch[1]] = stripPbxValue(settingMatch[2]);
      }
    }

    configs.set(name, settings);
  }

  return configs;
}

function getPlistStringValue(plistText, key) {
  const match = plistText.match(
    new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`),
  );
  return match?.[1] ?? null;
}

function hasPlistFalseValue(plistText, key) {
  return new RegExp(`<key>${key}</key>\\s*<false\\s*/>`).test(plistText);
}

function withEnv(env, callback) {
  const previousValues = new Map();

  for (const [key, value] of Object.entries(env)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function resolveExpoConfig(env) {
  const appJson = readJson('apps/mobile/app.json').expo;
  const appConfigFactory = require(path.join(mobileRoot, 'app.config.js'));

  return withEnv(env, () =>
    appConfigFactory({
      config: JSON.parse(JSON.stringify(appJson)),
    }),
  );
}

const appJson = readJson('apps/mobile/app.json').expo;
const podfileProperties = readJson('apps/mobile/ios/Podfile.properties.json');
const projectText = readText('apps/mobile/ios/YummyRecs.xcodeproj/project.pbxproj');
const infoPlist = readText('apps/mobile/ios/YummyRecs/Info.plist');
const targetConfigs = parseTargetBuildSettings(projectText);
const productionConfig = resolveExpoConfig({
  APP_VARIANT: 'production',
  EXPO_PUBLIC_APP_ENV: 'production',
});
const previewConfig = resolveExpoConfig({
  APP_VARIANT: 'preview',
  EXPO_PUBLIC_APP_ENV: 'beta',
});
const expectedDeploymentTarget = podfileProperties['ios.deploymentTarget'];

const expectedTargetConfigs = {
  Debug: {
    bundleIdentifier: productionConfig.ios.bundleIdentifier,
    appLinkHost: 'app.yummyrecs.com',
  },
  Release: {
    bundleIdentifier: productionConfig.ios.bundleIdentifier,
    appLinkHost: 'app.yummyrecs.com',
  },
  ReleasePreview: {
    bundleIdentifier: previewConfig.ios.bundleIdentifier,
    appLinkHost: 'beta.app.yummyrecs.com',
    bundleIdentifierSuffix: '.preview',
    displayNameSuffix: ' Preview',
    urlSchemeSuffix: '-preview',
  },
};

for (const [name, expected] of Object.entries(expectedTargetConfigs)) {
  const settings = targetConfigs.get(name);

  check(settings, `Missing iOS target build configuration "${name}".`);
  if (!settings) {
    continue;
  }

  check(
    settings.PRODUCT_BUNDLE_IDENTIFIER === expected.bundleIdentifier,
    `${name} PRODUCT_BUNDLE_IDENTIFIER is ${settings.PRODUCT_BUNDLE_IDENTIFIER}; expected ${expected.bundleIdentifier}.`,
  );
  check(
    settings.MARKETING_VERSION === appJson.version,
    `${name} MARKETING_VERSION is ${settings.MARKETING_VERSION}; expected ${appJson.version}.`,
  );
  check(
    settings.IPHONEOS_DEPLOYMENT_TARGET === expectedDeploymentTarget,
    `${name} IPHONEOS_DEPLOYMENT_TARGET is ${settings.IPHONEOS_DEPLOYMENT_TARGET}; expected ${expectedDeploymentTarget}.`,
  );
  check(
    settings.YUMMYRECS_IOS_APP_LINK_HOST === expected.appLinkHost,
    `${name} YUMMYRECS_IOS_APP_LINK_HOST is ${settings.YUMMYRECS_IOS_APP_LINK_HOST}; expected ${expected.appLinkHost}.`,
  );

  if (name === 'ReleasePreview') {
    check(
      settings.YUMMYRECS_IOS_BUNDLE_IDENTIFIER_SUFFIX === expected.bundleIdentifierSuffix,
      `${name} bundle suffix is ${settings.YUMMYRECS_IOS_BUNDLE_IDENTIFIER_SUFFIX}; expected ${expected.bundleIdentifierSuffix}.`,
    );
    check(
      settings.YUMMYRECS_IOS_DISPLAY_NAME_SUFFIX === expected.displayNameSuffix,
      `${name} display name suffix is ${settings.YUMMYRECS_IOS_DISPLAY_NAME_SUFFIX}; expected ${expected.displayNameSuffix}.`,
    );
    check(
      settings.YUMMYRECS_IOS_URL_SCHEME_SUFFIX === expected.urlSchemeSuffix,
      `${name} URL scheme suffix is ${settings.YUMMYRECS_IOS_URL_SCHEME_SUFFIX}; expected ${expected.urlSchemeSuffix}.`,
    );
  }
}

check(
  productionConfig.name === 'Yummy Recs' &&
    productionConfig.scheme === 'yummyrecs' &&
    productionConfig.ios.bundleIdentifier === 'com.yummyrecs.mobile',
  'Production Expo config identity must resolve to Yummy Recs / yummyrecs / com.yummyrecs.mobile.',
);
check(
  previewConfig.name === 'Yummy Recs Preview' &&
    previewConfig.scheme === 'yummyrecs-preview' &&
    previewConfig.ios.bundleIdentifier === 'com.yummyrecs.mobile.preview',
  'Preview Expo config identity must resolve to Yummy Recs Preview / yummyrecs-preview / com.yummyrecs.mobile.preview.',
);
check(
  previewConfig.runtimeVersion === `${appJson.version}-preview-embedded-1`,
  `Preview runtimeVersion is ${previewConfig.runtimeVersion}; expected ${appJson.version}-preview-embedded-1.`,
);

const expectedInfoPlistStrings = {
  CFBundleDisplayName: 'Yummy Recs$(YUMMYRECS_IOS_DISPLAY_NAME_SUFFIX)',
  CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
  CFBundleName: 'Yummy Recs$(YUMMYRECS_IOS_DISPLAY_NAME_SUFFIX)',
  CFBundleShortVersionString: appJson.version,
  NSCameraUsageDescription: appJson.ios.infoPlist.NSCameraUsageDescription,
  NSLocationWhenInUseUsageDescription: appJson.ios.infoPlist.NSLocationWhenInUseUsageDescription,
  NSMotionUsageDescription: appJson.ios.infoPlist.NSMotionUsageDescription,
  NSPhotoLibraryUsageDescription: appJson.ios.infoPlist.NSPhotoLibraryUsageDescription,
  UIUserInterfaceStyle: 'Automatic',
};

for (const [key, expectedValue] of Object.entries(expectedInfoPlistStrings)) {
  const actualValue = getPlistStringValue(infoPlist, key);
  check(
    actualValue === expectedValue,
    `Info.plist ${key} is ${actualValue}; expected ${expectedValue}.`,
  );
}

check(
  hasPlistFalseValue(infoPlist, 'ITSAppUsesNonExemptEncryption'),
  'Info.plist ITSAppUsesNonExemptEncryption must be false.',
);
check(
  getPlistStringValue(infoPlist, 'CFBundleVersion') === '1',
  `Info.plist CFBundleVersion is ${getPlistStringValue(infoPlist, 'CFBundleVersion')}; expected 1.`,
);
check(
  existsSync(path.join(mobileRoot, 'ios/Pods/Target Support Files/Pods-YummyRecs/Pods-YummyRecs.releasepreview.xcconfig')) ||
    projectText.includes('Pods-YummyRecs.releasepreview.xcconfig'),
  'ReleasePreview must remain wired to a Pods-YummyRecs.releasepreview.xcconfig base configuration.',
);

if (failures.length > 0) {
  console.error('Mobile native sync validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Mobile native sync validation passed.');

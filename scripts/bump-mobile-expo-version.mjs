#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const APP_JSON_PATH = path.join(ROOT_DIR, 'apps/mobile/app.json');
const IOS_INFO_PLIST_PATH = path.join(ROOT_DIR, 'apps/mobile/ios/YummyRecs/Info.plist');
const IOS_EXPO_PLIST_PATH = path.join(ROOT_DIR, 'apps/mobile/ios/YummyRecs/Supporting/Expo.plist');
const IOS_PROJECT_PATH = path.join(ROOT_DIR, 'apps/mobile/ios/YummyRecs.xcodeproj/project.pbxproj');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const releaseType = args.find((arg) => !arg.startsWith('--')) ?? 'patch';

const appJsonText = await readFile(APP_JSON_PATH, 'utf8');
const appJson = JSON.parse(appJsonText);
const expoConfig = appJson.expo;

if (!expoConfig || typeof expoConfig !== 'object') {
  fail('apps/mobile/app.json must contain an expo config object.');
}

const currentVersion = expoConfig.version;
if (typeof currentVersion !== 'string') {
  fail('apps/mobile/app.json expo.version must be a string.');
}

const nextVersion = bumpSemver(currentVersion, releaseType);
expoConfig.version = nextVersion;

if (expoConfig.ios?.runtimeVersion === currentVersion) {
  expoConfig.ios.runtimeVersion = nextVersion;
}

const iosInfoPlistText = await readFile(IOS_INFO_PLIST_PATH, 'utf8');
const iosExpoPlistText = await readFile(IOS_EXPO_PLIST_PATH, 'utf8');
const iosProjectText = await readFile(IOS_PROJECT_PATH, 'utf8');

const iosInfoPlistResult = replacePlistStringValue(
  iosInfoPlistText,
  'CFBundleShortVersionString',
  nextVersion,
  IOS_INFO_PLIST_PATH,
);
const iosExpoPlistResult = replacePlistStringValue(
  iosExpoPlistText,
  'EXUpdatesRuntimeVersion',
  nextVersion,
  IOS_EXPO_PLIST_PATH,
);
const iosProjectResult = replaceXcodeBuildSetting(
  iosProjectText,
  'MARKETING_VERSION',
  nextVersion,
  IOS_PROJECT_PATH,
);

if (!dryRun) {
  await writeFile(APP_JSON_PATH, `${JSON.stringify(appJson, null, 2)}\n`);
  await writeFile(IOS_INFO_PLIST_PATH, iosInfoPlistResult.text);
  await writeFile(IOS_EXPO_PLIST_PATH, iosExpoPlistResult.text);
  await writeFile(IOS_PROJECT_PATH, iosProjectResult.text);
}

const prefix = dryRun ? 'Would bump' : 'Bumped';
console.log(`${prefix} mobile Expo version: ${currentVersion} -> ${nextVersion}`);
console.log(
  `${prefix} iOS CFBundleShortVersionString: ${iosInfoPlistResult.previousValue} -> ${nextVersion}`,
);
console.log(`${prefix} iOS EXUpdatesRuntimeVersion: ${iosExpoPlistResult.previousValue} -> ${nextVersion}`);
console.log(`${prefix} iOS MARKETING_VERSION: ${iosProjectResult.previousValues.join(', ')} -> ${nextVersion}`);

function bumpSemver(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    fail(`Expected expo.version to use x.y.z semver, received ${JSON.stringify(version)}.`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  switch (type) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
    default:
      fail(`Unsupported release type ${JSON.stringify(type)}. Use patch, minor, or major.`);
  }

  return `${major}.${minor}.${patch}`;
}

function replacePlistStringValue(text, key, value, filePath) {
  const escapedKey = escapeRegExp(key);
  const pattern = new RegExp(`(<key>${escapedKey}</key>\\s*<string>)([^<]*)(</string>)`);
  const match = pattern.exec(text);

  if (!match) {
    fail(`Could not find ${key} string value in ${path.relative(ROOT_DIR, filePath)}.`);
  }

  return {
    text: text.replace(pattern, `$1${value}$3`),
    previousValue: match[2],
  };
}

function replaceXcodeBuildSetting(text, key, value, filePath) {
  const escapedKey = escapeRegExp(key);
  const pattern = new RegExp(`(${escapedKey} = )([^;]+)(;)`, 'g');
  const previousValues = [];
  const updatedText = text.replace(pattern, (_match, prefix, previousValue, suffix) => {
    previousValues.push(previousValue);
    return `${prefix}${value}${suffix}`;
  });

  if (previousValues.length === 0) {
    fail(`Could not find ${key} build setting in ${path.relative(ROOT_DIR, filePath)}.`);
  }

  return {
    text: updatedText,
    previousValues: [...new Set(previousValues)],
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

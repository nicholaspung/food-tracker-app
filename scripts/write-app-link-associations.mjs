#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [, , targetDirArg, environmentArg] = process.argv;

if (!targetDirArg) {
  console.error('Usage: write-app-link-associations.mjs <target-dir> [beta|production]');
  process.exit(1);
}

const environment = environmentArg === 'beta' ? 'beta' : 'production';
const targetDir = path.resolve(targetDirArg);
const wellKnownDir = path.join(targetDir, '.well-known');
const bundleIdentifier =
  environment === 'beta' ? 'com.yummyrecs.mobile.preview' : 'com.yummyrecs.mobile';
const androidPackage = bundleIdentifier;
const iosTeamId = process.env.FOOD_TRACKER_IOS_TEAM_ID?.trim();
const androidFingerprints = (process.env.FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

await mkdir(wellKnownDir, { recursive: true });

if (iosTeamId) {
  const appleAssociation = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${iosTeamId}.${bundleIdentifier}`,
          paths: ['/reset-password*', '/verify-email*'],
        },
      ],
    },
  };

  await writeFile(
    path.join(wellKnownDir, 'apple-app-site-association'),
    `${JSON.stringify(appleAssociation, null, 2)}\n`,
    'utf8',
  );
} else {
  console.warn('Skipping apple-app-site-association: FOOD_TRACKER_IOS_TEAM_ID is not set.');
}

if (androidFingerprints.length > 0) {
  const assetLinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: androidPackage,
        sha256_cert_fingerprints: androidFingerprints,
      },
    },
  ];

  await writeFile(path.join(wellKnownDir, 'assetlinks.json'), `${JSON.stringify(assetLinks, null, 2)}\n`, 'utf8');
} else {
  console.warn('Skipping assetlinks.json: FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS is not set.');
}

const path = require('path');
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

const config = getPostHogExpoConfig(__dirname);
const mobileNodeModules = path.resolve(__dirname, 'node_modules');
const workspaceNodeModules = path.resolve(__dirname, '..', '..', 'node_modules');
const workspaceRoot = path.resolve(__dirname, '..', '..');

function resolveModule(request) {
  return require.resolve(request, { paths: [__dirname, workspaceRoot] });
}

function resolvePackageDir(packageName) {
  return path.dirname(resolveModule(`${packageName}/package.json`));
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const reactPackageDir = resolvePackageDir('react');
const reactNativePackageDir = resolvePackageDir('react-native');
const duplicateReactDirs = [path.join(mobileNodeModules, 'react'), path.join(workspaceNodeModules, 'react')].filter(
  (dir, index, dirs) => dir !== reactPackageDir && dirs.indexOf(dir) === index,
);
const duplicateReactNativeDirs = [
  path.join(mobileNodeModules, 'react-native'),
  path.join(workspaceNodeModules, 'react-native'),
].filter((dir, index, dirs) => dir !== reactNativePackageDir && dirs.indexOf(dir) === index);

config.resolver = config.resolver ?? {};
config.resolver.assetExt = config.resolver.assetExt ?? [];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: reactPackageDir,
  'react/jsx-runtime': resolveModule('react/jsx-runtime'),
  'react/jsx-dev-runtime': resolveModule('react/jsx-dev-runtime'),
  'react/compiler-runtime': resolveModule('react/compiler-runtime'),
  'react-native': reactNativePackageDir,
};
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  ...duplicateReactDirs.map((dir) => new RegExp(`^${escapeForRegExp(dir)}(?:/.*)?$`)),
  ...duplicateReactNativeDirs.map((dir) => new RegExp(`^${escapeForRegExp(dir)}(?:/.*)?$`)),
];

if (!config.resolver.assetExt.includes('wasm')) {
  config.resolver.assetExt.push('wasm');
}

module.exports = config;

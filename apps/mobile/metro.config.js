const path = require('path');
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

const config = getPostHogExpoConfig(__dirname);
const mobileNodeModules = path.resolve(__dirname, 'node_modules');
const workspaceNodeModules = path.resolve(__dirname, '..', '..', 'node_modules');

config.resolver = config.resolver ?? {};
config.resolver.assetExt = config.resolver.assetExt ?? [];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: path.join(mobileNodeModules, 'react'),
  'react/jsx-runtime': path.join(mobileNodeModules, 'react', 'jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(mobileNodeModules, 'react', 'jsx-dev-runtime.js'),
  'react/compiler-runtime': path.join(mobileNodeModules, 'react', 'compiler-runtime.js'),
  'react-native': path.join(mobileNodeModules, 'react-native'),
};
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  new RegExp(`${workspaceNodeModules.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/react/.*`),
  new RegExp(`${workspaceNodeModules.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/react-native/.*`),
];

if (!config.resolver.assetExt.includes('wasm')) {
  config.resolver.assetExt.push('wasm');
}

module.exports = config;

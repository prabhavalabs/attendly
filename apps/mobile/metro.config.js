// Metro config tuned for the pnpm monorepo (Expo SDK 56 / RN 0.85).
// Watches the workspace root so Metro can transform `@tuition/shared` (raw TS),
// and resolves modules from both the app and the workspace root node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. pnpm uses symlinks for workspace packages; keep hierarchical lookup so
//    Metro follows them up to the workspace root.
config.resolver.disableHierarchicalLookup = false;

// 4. expo-sqlite's web build (wa-sqlite) imports a .wasm module — register it
//    as an asset so Metro can bundle it for the web/PWA target. (Serving the
//    PWA still needs cross-origin-isolation headers for SharedArrayBuffer.)
config.resolver.assetExts.push("wasm");

module.exports = config;

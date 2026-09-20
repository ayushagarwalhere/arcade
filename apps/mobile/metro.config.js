const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const config = getDefaultConfig(__dirname);

// On Windows this repo lives in OneDrive, so node_modules is a junction to a
// folder outside it (see README). Metro follows the junction to its real path,
// which then has to be watched and searched like the in-project one.
const modules = path.join(__dirname, "node_modules");
const real = fs.realpathSync(modules);
if (real !== modules) {
  config.watchFolders = [...(config.watchFolders ?? []), real];
  config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), real];
}

module.exports = config;

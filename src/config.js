const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir } = require('./common.js');

function readConfig() {
  const cfgPath = join(rootDir, cfgFile);
  try {
    const cfg = sync(cfgPath);
    return cfg
  } catch (err) {
    return err
  }
}

module.exports.readconfig = readConfig;

const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common.js');
const progress = require ('cli-progress');

function readConfig() {
  const cfgPath = join(rootDir, cfgFile);
  const cfgProgress = new progress.Bar({
    format: fmtProgressBar(`loading configuration from ${cfgPath}`),
    barsize: 20
  }, progress.Presets.shades_classic);
  cfgProgress.start(1, 0);
  let cfg = sync(cfgPath);
  cfgProgress.update(1);
  cfgProgress.stop();
  return cfg;
}

module.exports.readconfig = readConfig;

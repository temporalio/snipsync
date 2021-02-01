const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common');
const progress = require('cli-progress');

module.exports.readConfig = () => {
  const cfgPath = join(rootDir, cfgFile);
  const cfgProgress = new progress.Bar({
    format: fmtProgressBar(`loading configuration from ${cfgPath}`),
    barsize: 20,
  }, progress.Presets.shades_classic);
  cfgProgress.start(1, 0);
  const cfg = sync(cfgPath);

  //Enable source link is set to true if it isn't specified in the config
  if (cfg?.features?.enable_source_link ?? true) {
    cfg['features'] = {};
    cfg['features']['enable_source_link'] = true;
  }

  cfgProgress.update(1);
  cfgProgress.stop();
  return cfg;
};

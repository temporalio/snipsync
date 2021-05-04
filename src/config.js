const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common');

module.exports.readConfig = (logger) => {
  const cfgPath = join(rootDir, cfgFile);
  logger.info(`loading configuration from ${cfgPath}`)
  const cfg = sync(cfgPath);

  //Enable source link is set to true if it isn't specified in the config
  if (cfg?.features?.enable_source_link ?? true) {
    cfg['features'] = {};
    cfg['features']['enable_source_link'] = true;
  }
  
  return cfg;
};

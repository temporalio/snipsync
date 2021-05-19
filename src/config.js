const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common');

module.exports.readConfig = (logger) => {
  const cfgPath = join(rootDir, cfgFile);
  logger.info(`loading configuration from ${cfgPath}`);
  const cfg = sync(cfgPath);

  // Enable source links if not specified in the config
  if (cfg?.features?.enable_source_link ?? true) {
    cfg['features'] = {};
    cfg['features']['enable_source_link'] = true;
  }

  // Enable code blocks if not specified in the config
  if (cfg?.features?.enable_code_block ?? true) {
    cfg['features']['enable_code_block'] = true;
  }

  return cfg;
};

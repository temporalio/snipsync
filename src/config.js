const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common');

module.exports.readConfig = (logger) => {
  const cfgPath = join(rootDir, cfgFile);
  logger.info(`loading configuration from ${cfgPath}`);
  const cfg = sync(cfgPath);

  // add features section if not specified
  if (!Object.prototype.hasOwnProperty.call(cfg, 'features')) {
    cfg['features'] = {};
  }

  // Enable source links if not specified in the config
  if (!Object.prototype.hasOwnProperty.call(cfg.features, 'enable_source_link')) {
    cfg['features']['enable_source_link'] = true;
  }

  // Enable code blocks if not specified in the config
  if (!Object.prototype.hasOwnProperty.call(cfg.features, 'enable_code_block')) {
    cfg['features']['enable_code_block'] = true;
  }

  // If allowed_target_extensions option isn't set, set it to an empty array
  // which will ignore the option and include all files.
  if (!Object.prototype.hasOwnProperty.call(cfg.features, 'allowed_target_extensions')) {
    cfg['features']['allowed_target_extensions'] = [];
  }

  return cfg;
};

const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common');

module.exports.readConfig = (logger) => {
  const cfgPath = join(rootDir, cfgFile);
  logger.info(`loading configuration from ${cfgPath}`);
  const cfg = sync(cfgPath);

  // add features section if not specified
  if (!cfg.hasOwnProperty('features')) {
    cfg['features'] = {};
  }

  // Enable source links if not specified in the config
  if (!cfg.features.hasOwnProperty('enable_source_link')) {
    cfg['features']['enable_source_link'] = true;
  }

  // Enable code blocks if not specified in the config
  if (!cfg.features.hasOwnProperty('enable_code_block')) {
    cfg['features']['enable_code_block'] = true;
  }

  // If allowed_target_extensions option isn't set, set it to an empty array
  // which will ignore the option and include all files.
  if (!cfg.features.hasOwnProperty('allowed_target_extensions')) {
    cfg['features']['allowed_target_extensions'] = [];
  }

  return cfg;
};

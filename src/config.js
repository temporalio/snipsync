const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common');

module.exports.readConfig = (logger, file = "") => {
  // allow user to specify a configuration file path other than the default.
  const cfgPath = file === "" ? join(rootDir, cfgFile) : file;
  logger.info(`loading configuration from ${cfgPath}`);
  const cfg = sync(cfgPath);
  cfg['root_dir'] = rootDir;

  // Destructure features from cfg and assign default values
  const {
    enable_source_link = true,
    enable_code_block = true,
    allowed_target_extensions = [],
    enable_code_dedenting = false,
  } = cfg.features || {};

  // Update the features section in cfg with the default values
  cfg.features = {
    enable_source_link,
    enable_code_block,
    allowed_target_extensions,
    enable_code_dedenting,
  };

  return cfg;
};
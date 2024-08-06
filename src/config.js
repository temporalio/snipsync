const { join } = require('path');
const { sync } = require('node-read-yaml');
const { cfgFile, rootDir, fmtProgressBar } = require('./common');

module.exports.readConfig = (logger, file="") => {
  // allow user to specify a configuration file path other than the default.
  const cfgPath = file === "" ? join(rootDir, cfgFile) : file;
  logger.info(`loading configuration from ${cfgPath}`);
  const cfg = sync(cfgPath);
  cfg['root_dir'] = rootDir;

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

  // Enable ellipsis between snips
  if (!Object.prototype.hasOwnProperty.call(cfg.features, 'enable_ellipsis')) {
    cfg['features']['enable_ellipsis'] = true;
  }

  // If allowed_target_extensions option isn't set, set it to an empty array
  // which will ignore the option and include all files.
  if (!Object.prototype.hasOwnProperty.call(cfg.features, 'allowed_target_extensions')) {
    cfg['features']['allowed_target_extensions'] = [];
  }

  // Disable code block dedenting by default if not specified
  if (!Object.prototype.hasOwnProperty.call(cfg.features, 'enable_code_dedenting')) {
    cfg['features']['enable_code_dedenting'] = false;
  }

  return cfg;
};

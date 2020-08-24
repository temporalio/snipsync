#!/usr/bin/env node
const logger = require('js-logger');
const config = require ('./config.js');
const sync = require ('./sync.js');

logger.useDefaults();

cfg = config.readconfig();
if (cfg instanceof Error) {
  logger.error("unable to read config file: " + cfg);
}
logger.info("config loaded:");
logger.info(cfg);

synctron = new sync.Sync(cfg, logger);
synctron.run();

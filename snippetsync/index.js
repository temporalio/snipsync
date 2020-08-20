#!/usr/bin/env node
var logger = require('js-logger');
var config = require ('./config.js');

logger.useDefaults();

cfg = config.readconfig();
if (cfg instanceof Error) {
  logger.error("unable to read config file: " + cfg);
}
logger.info("config loaded:");
logger.info(cfg);

#!/usr/bin/env node
const logger = require('js-logger');
const config = require ('./config');
const common = require ('./common');
const { Sync } = require ('./Sync');

logger.useDefaults();
const args = process.argv.slice(2);
const cfg = config.readConfig();
const synctron = new Sync(cfg, logger);

switch (args[0]) {
  case '--clear':
    synctron.clear()
    break;
  default:
    synctron.run();
}

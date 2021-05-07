#!/usr/bin/env node
const logger = require('js-logger');
const { readConfig } = require('./src/config');
const { Sync } = require('./src/Sync');

logger.useDefaults();
const args = process.argv.slice(2);
const cfg = readConfig(logger);
const synctron = new Sync(cfg, logger);

switch (args[0]) {
  case '--clear':
    synctron.clear();
    break;
  default:
    synctron.run();
}

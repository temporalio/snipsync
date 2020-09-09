#!/usr/bin/env node
const logger = require('js-logger');
const config = require ('./config');
const common = require ('./common');
const { Sync } = require ('./Sync');

logger.useDefaults();

const cfg = config.readConfig();

const synctron = new Sync(cfg, logger);

synctron.run();


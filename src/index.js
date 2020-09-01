#!/usr/bin/env node
const logger = require('js-logger');
const config = require ('./config.js');
const sync = require ('./sync.js');
const common = require ('./common.js');

logger.useDefaults();

cfg = config.readconfig();

synctron = new sync.Sync(cfg, logger);

synctron.run();

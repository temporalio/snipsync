#!/usr/bin/env node
const logger = require('js-logger');
const config = require ('./config.js');
const sync = require ('./sync.js');
const progress = require ('cli-progress');
const common = require ('./common.js');

logger.useDefaults();


const cfgProgress = new progress.Bar({
  format: common.fmtProgressBar("loading configuration"),
  barsize: 20
}, progress.Presets.shades_classic);
cfgProgress.start(1, 0);
cfg = config.readconfig();
if (cfg instanceof Error) {
  logger.error("unable to read config file: " + cfg);
}
cfgProgress.update(1);
cfgProgress.stop();

synctron = new sync.Sync(cfg, logger);
synctron.run();

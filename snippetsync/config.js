const readcfg = require('node-read-yaml');
const common = require('./common.js');

function readConfig() {
  dir = process.cwd()
  path = dir + "/" + common.cfgfile
  try {
    const cfg = readcfg.sync(path);
    return cfg
  } catch (err) {
    return err
  }
}

module.exports.readconfig = readConfig;

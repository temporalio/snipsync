const readcfg = require('node-read-yaml');
const common = require('./common.js');

const { GITHUB_AUTH_TOKEN } = process.env;

function readConfig() {
  if (!GITHUB_AUTH_TOKEN) {
    throw new Error('Environment variable "GITHUB_AUTH_TOKEN" must be defined!');
  }
  dir = process.cwd()
  path = dir + "/" + common.cfgfile
  try {
    const cfg = readcfg.sync(path);
    cfg.auth = { token: GITHUB_AUTH_TOKEN };
    console.log(cfg);
    return cfg
  } catch (err) {
    return err
  }
}

module.exports.readconfig = readConfig;

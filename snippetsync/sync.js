const { Octokit } = require("@octokit/rest");

class Sync {
  constructor(cfg, logger) {
    this.config = cfg;
    this.logger = logger;
    const octokit = new Octokit({
      auth: cfg.auth.token
    })
    this.github = octokit;
  }
}

module.exports.Sync = Sync;

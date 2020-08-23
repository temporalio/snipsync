const { Octokit } = require("@octokit/rest");
const common = require('./common.js');
const fs = require('fs');
const arrayBuffToBuff = require('arraybuffer-to-buffer');
const unzipper = require('unzipper');


class Sync {
  constructor(cfg, logger) {
    this.config = cfg;
    this.origins = cfg.origins;
    this.logger = logger;
    const octokit = new Octokit({
      auth: cfg.auth.token
    })
    this.github = octokit;
  }

  async getRepos () {
    var self = this;
    for (var i = 0; i < this.origins.length; i++) {
      var origin = this.origins[i];
      self.logger.info("downloading repo: " + origin.owner + "/" + origin.repo);
      var bytearray = await this.getArchive(origin);
      var filename = origin.repo + ".zip"
      self.logger.info("saving as " + filename);
      var buffer = arrayBuffToBuff(bytearray);
      fs.writeFile(filename, buffer, async function(err){
        await self.unzip(filename)
      });
    }
  }

  async unzip(filename) {
    var self = this;
    var dir = process.cwd();
    var zipPath = dir + "/" + filename;
    var extractPath = dir + "/" + common.extractionDir;
    self.logger.info("extracting to " + extractPath);
    var result = await fs.createReadStream(zipPath).pipe(
      unzipper.Extract({
        path: extractPath
      })
    );
    self.logger.info("extraction successful");
  }

  async getArchive(origin) {
    const result = await this.github.repos.downloadArchive({
      owner: origin.owner,
      repo: origin.repo,
      archive_format: "zipball"
    });
    return result.data
  }
}

module.exports.Sync = Sync;

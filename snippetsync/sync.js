const { Octokit } = require("@octokit/rest");
const common = require('./common.js');
const { writeFile, unlink, createReadStream } = require('fs');
const { promisify } = require('util');
const arrayBuffToBuff = require('arraybuffer-to-buffer');
const unzipper = require('unzipper');
const snip = require('./snippet.js');
const readdirp = require('readdirp');
const lineReader = require('line-reader');

const writeAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

class Sync {
  constructor(cfg, logger) {
    this.config = cfg;
    this.origins = cfg.origins;
    this.logger = logger;
    const octokit = new Octokit({
      auth: cfg.auth.token
    })
    this.github = octokit;
    this.snippets = [];
  }

  async run () {
    await this.getRepos();
    var filePaths = await this.getFilePaths();
    console.log(filePaths);
    var snippets = await this.extractSnippets(filePaths);
  }

  async getRepos () {
    for (let i = 0; i < this.origins.length; i++) {
      let origin = this.origins[i];
      this.logger.info("downloading repo: " + origin.owner + "/" + origin.repo);
      let bytearray = await this.getArchive(origin);
      let filename = origin.repo + ".zip"
      this.logger.info("saving as " + filename);
      let buffer = arrayBuffToBuff(bytearray);
      const raw = await writeAsync(filename, buffer);
      await this.unzip(filename);
    }
  }

  async unzip(filename) {
    var self = this;
    var dir = process.cwd();
    var zipPath = dir + "/" + filename;
    var extractPath = dir + "/" + common.extractionDir;
    self.logger.info("extracting to " + extractPath);
    var result = await createReadStream(zipPath).pipe(
      unzipper.Extract({
        path: extractPath
      })
    );
    await unlinkAsync(zipPath);
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

  async getFilePaths () {
    var self = this;
    var dir = process.cwd();
    var readDir = dir + "/" + common.extractionDir;
    var allFilePaths = [];
    var settings = {
      root: readDir,
      entryType: 'all'
    }
    self.logger.info("loading file paths")
    for await (const entry of readdirp(readDir)) {
      const {path} = entry;
      allFilePaths.push({path})
    }
    return allFilePaths;
  }

  async extractSnippets (filePaths) {
    var self = this;
    self.logger.info("extracting snippets from files");
    var dir = await process.cwd();
    var extractPath = await dir + "/" + common.extractionDir;
    var snippets = [];
    for (var i = 0; i < filePaths.length; i++) {
      var item = await filePaths[i];
      var ext = await determineExtension(item.path);
      var path = await extractPath + "/" + item.path;
      var capture = false;
      var fileSnipsCount = 0;
      var fileSnips = [];
      await lineReader.eachLine(path, async function(line) {
        if (line.includes(common.readend)) {
          capture = false;
          fileSnipsCount++;
        }
        if (capture) {
          await fileSnips[fileSnipsCount].lines.push(line);
        }
        if (line.includes(common.readstart)) {
          self.logger.info("snippet found");
          capture = true;
          var s = new snip.Snippet(ext);
          await fileSnips.push(s)
          await console.log(fileSnips);
        }
      })
      await snippets.push(...fileSnips)
    }
    console.log(snippets);
    return snippets;
  }
}

function determineExtension(path) {
  var parts = path.split(".");
  var index = parts.length - 1;
  var ext = parts[index];
  return ext;
}

module.exports.Sync = Sync;

const { Octokit } = require("@octokit/rest");
const common = require('./common.js');
const { writeFile, unlink, createReadStream } = require('fs');
const { promisify } = require('util');
const arrayBuffToBuff = require('arraybuffer-to-buffer');
const unzipper = require('unzipper');
const snip = require('./snippet.js');
const readdirp = require('readdirp');
const { eachLine } = require('line-reader');

const writeAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);
const eachLineAsync = promisify(eachLine);

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
    let filePaths = await this.getFilePaths();
    let snippets = await this.extractSnippets(filePaths);
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
    let dir = process.cwd();
    let zipPath = dir + "/" + filename;
    let extractPath = dir + "/" + common.extractionDir;
    this.logger.info("extracting to " + extractPath);
    let result = await createReadStream(zipPath).pipe(
      unzipper.Extract({
        path: extractPath
      })
    );
    await unlinkAsync(zipPath);
    this.logger.info("extraction successful");
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
    let dir = process.cwd();
    let readDir = dir + "/" + common.extractionDir;
    let allFilePaths = [];
    let settings = {
      root: readDir,
      entryType: 'all'
    }
    this.logger.info("loading file paths")
    for await (const entry of readdirp(readDir)) {
      const {path} = entry;
      allFilePaths.push({path})
    }
    return allFilePaths;
  }

  async extractSnippets (filePaths) {
    this.logger.info("extracting snippets from files");
    let dir = process.cwd();
    let extractPath = dir + "/" + common.extractionDir;
    let snippets = [];
    for (let i = 0; i < filePaths.length; i++) {
      let item = filePaths[i];
      let ext = determineExtension(item.path);
      let path = extractPath + "/" + item.path;
      let capture = false;
      let fileSnipsCount = 0;
      let fileSnips = [];
      await eachLineAsync(path, (line) => {
        if (line.includes(common.readend)) {
          capture = false;
          fileSnipsCount++;
        }
        if (capture) {
          fileSnips[fileSnipsCount].lines.push(line);
        }
        if (line.includes(common.readstart)) {
          this.logger.info("snippet found");
          capture = true;
          let s = new snip.Snippet(ext);
          fileSnips.push(s)
          console.log(fileSnips);
        }
      });
      snippets.push(...fileSnips)
    }
    console.log(snippets);
    return snippets;
  }
}

function determineExtension(path) {
  let parts = path.split(".");
  let index = parts.length - 1;
  let ext = parts[index];
  return ext;
}

module.exports.Sync = Sync;

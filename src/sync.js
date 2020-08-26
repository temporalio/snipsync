const { Octokit } = require("@octokit/rest");
const common = require('./common.js');
const { writeFile, unlink, createReadStream, rmdirSync } = require('fs');
const { promisify } = require('util');
const arrayBuffToBuff = require('arraybuffer-to-buffer');
const unzipper = require('unzipper');
const snip = require('./snippet.js');
const fi = require('./file.js');
const readdirp = require('readdirp');
const { eachLine } = require('line-reader');

const writeAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);
const eachLineAsync = promisify(eachLine);
const rmdirAsync = promisify(rmdirSync);

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

  async run() {
    await this.getRepos();
    let extractfp = await this.getExtractionFilePaths();
    let snippets = await this.extractSnippets(extractfp);
    let insertfps = await this.getInsertFilePaths();
    let files = await this.getInsertFiles(insertfps);
    let filesToWrite = await this.spliceSnippets(snippets, files);
    await this.writeFiles(filesToWrite);
    await this.cleanUp();

  }

  async getRepos() {
    for (let i = 0; i < this.origins.length; i++) {
      let origin = this.origins[i];
      this.logger.info("downloading repo: " + dirAppend(origin.owner, origin.repo));
      let bytearray = await this.getArchive(origin);
      let filename = origin.repo + ".zip"
      this.logger.info("saving as " + filename);
      let buffer = arrayBuffToBuff(bytearray);
      const raw = await writeAsync(filename, buffer);
      await this.unzip(filename);
    }
  }

  async unzip(filename) {
    let zipPath = dirAppend(common.rootDir, filename);
    let unzipPath = dirAppend(common.rootDir, common.extractionDir);
    this.logger.info("extracting to " + unzipPath);
    let result = await createReadStream(zipPath).pipe(
      unzipper.Extract({
        path: unzipPath
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

  async getExtractionFilePaths() {
    let readDir = dirAppend(common.rootDir, common.extractionDir);
    this.logger.info("loading extraction file paths from " + readDir);
    let filePaths = [];
    for await (const entry of readdirp(readDir)) {
      const {path} = entry;
      filePaths.push({path})
    }
    return filePaths;
  }

  async extractSnippets (filePaths) {
    this.logger.info("extracting snippets from files");
    let extractRootPath = dirAppend(common.rootDir, common.extractionDir);
    let snippets = [];
    for (let i = 0; i < filePaths.length; i++) {
      let item = filePaths[i];
      let ext = determineExtension(item.path);
      let path = dirAppend(extractRootPath, item.path);
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
          capture = true;
          let id = extractID(line);
          this.logger.info("snippet " + id + " found");
          let s = new snip.Snippet(id, ext);
          fileSnips.push(s)
        }
      });
      snippets.push(...fileSnips)
    }
    for (let j = 0; j<snippets.length; j++) {
      snippets[j].fmt();
    }
    return snippets;
  }

  async getInsertFilePaths() {
    let writeDir = dirAppend(common.rootDir, this.config.target);
    this.logger.info("loading insert file paths from " + writeDir);
    let insertFilePaths = [];
    for await (const entry of readdirp(writeDir)) {
      const {path} = entry;
      insertFilePaths.push({path});
    }
    return insertFilePaths;
  }

  async getInsertFiles(filePaths) {
    this.logger.info("loading file lines for each insert file");
    let files = [];
    for (let i = 0; i < filePaths.length; i++) {
      files.push(await this.getInsertFileLines(filePaths[i].path));
    }
    return files;
  }

  async getInsertFileLines(filename) {
    let insertRootPath = dirAppend(common.rootDir, this.config.target);
    let path = dirAppend(insertRootPath, filename);
    let file = new fi.File(filename);
    let fileLines = [];
    await eachLineAsync(path, (line) => {
      fileLines.push(line);
    });
    file.lines = fileLines;
    return file;
  }

  async spliceSnippets(snippets, files) {
    this.logger.info("starting splice operations");
    for (let i = 0; i < snippets.length; i++) {
      for (let f = 0; f< files.length; f++) {
        files[f] = await this.getSplicedFile(snippets[i], files[f]);
      }
    }
    return files;
  }

  async getSplicedFile(snippet, file) {
    this.logger.info("looking for splice spots in " + file.filename + " for " + snippet.id);
    let staticFile = file;
    let dynamicFile = file;
    let fileLineNumber = 1;
    let lookForStop = false;
    let spliceStart = 0;
    for (let i = 0; i < staticFile.lines.length; i++) {
      let line = file.lines[i];
      if (line.includes(common.writestart)) {
        let id = insertID(line);
        if (id == snippet.id) {
          spliceStart = fileLineNumber;
          lookForStop = true
        }
      }
      if (line.includes(common.writeend) && lookForStop) {
        dynamicFile = await this.spliceFile(spliceStart, fileLineNumber, snippet, dynamicFile);
        lookForStop = false;
      }
      fileLineNumber++;
    }
    return dynamicFile;
  }

  async spliceFile(start, end, snippet, file) {
    let rmlines = end - start;
    file.lines.splice(start, rmlines - 1, ...snippet.lines);
    return file;
  }

  async writeFiles(files) {
    let insertRootPath = dirAppend(common.rootDir, this.config.target);
    for (let i = 0; i< files.length; i++) {
      let file = files[i];
      let fileString = file.lines.join("\n");
      let writePath = dirAppend(insertRootPath, file.filename);
      const raw = await writeAsync(writePath, fileString);
    }
  }

  async cleanUp() {
    let options = {
      recursive: true
    }
    await rmdirAsync(dirAppend(common.rootDir, common.extractionDir), options, (err) => {
      if (err != null) {
        console.log(err);
      }
    });
  }
}

function determineExtension(path) {
  let parts = path.split(".");
  return parts[parts.length - 1];
}

function extractID(line) {
  let parts = line.split(" ");
  return parts[parts.length - 1];
}

function insertID(line) {
  let parts = line.split(" ")
  let part = parts[parts.length - 1]
  return part.replace("-->", "");
}

function dirAppend(root, dir) {
  return root + "/" + dir;
}

module.exports.Sync = Sync;

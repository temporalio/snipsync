const { Octokit } = require("@octokit/rest");
const common = require('./common.js');
const { writeFile, unlink, createReadStream } = require('fs');
const { promisify } = require('util');
const arrayBuffToBuff = require('arraybuffer-to-buffer');
const unzipper = require('unzipper');
const snip = require('./snippet.js');
const fi = require('./file.js');
const readdirp = require('readdirp');
const { eachLine } = require('line-reader');
const rimraf = require('rimraf');
const progress = require ('cli-progress');

const writeAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);
const eachLineAsync = promisify(eachLine);
const rimrafAsync = promisify(rimraf);
const createReadStreamAsync = promisify(createReadStream);

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
    // Download repo as zip file and extract to sync_repos directory
    await this.getRepos();
    // Get the names of all the files in the sync_repos directory
    let extractfp = await this.getExtractionFilePaths();
    // Search each file and scrape the snippets
    let snippets = await this.extractSnippets(extractfp);
    // Get the names of all the files in the target directory
    let insertfps = await this.getInsertFilePaths();
    // Create an object for each file in the target directory
    let files = await this.getInsertFiles(insertfps);
    // Splice the snippets in the file objects
    let filesToWrite = await this.spliceSnippets(snippets, files);
    // Overwrite the files to the target directory
    await this.writeFiles(filesToWrite);
    // Delete the sync_repos directory
    await this.cleanUp();
    this.logger.info("Snippet sync operation complete!");
  }

  async getRepos() {
    for (let i = 0; i < this.origins.length; i++) {
      let origin = this.origins[i];
      const dlProgress = new progress.Bar({
        format: common.fmtProgressBar("downloading repo " + dirAppend(origin.owner, origin.repo)),
        barsize: 20
      }, progress.Presets.shades_classic);
      dlProgress.start(3, 0);
      let bytearray = await this.getArchive(origin);
      dlProgress.increment();
      let filename = origin.repo + ".zip"
      let buffer = arrayBuffToBuff(bytearray);
      const raw = await writeAsync(filename, buffer);
      dlProgress.increment();
      await this.unzip(filename);
      dlProgress.increment();
      dlProgress.stop();
    }
    return;
  }

  async unzip(filename) {
    let zipPath = dirAppend(common.rootDir, filename);
    let unzipPath = dirAppend(common.rootDir, common.extractionDir);
    let result = await createReadStream(zipPath).pipe(
      await unzipper.Extract({
        path: unzipPath
      })
    );
    await unlinkAsync(zipPath);
  }

  async getArchive(origin) {
    const result = await this.github.repos.downloadArchive({
      owner: origin.owner,
      repo: origin.repo,
      ref: origin.ref,
      archive_format: "zipball"
    });
    return result.data;
  }

  async getExtractionFilePaths() {
    let readDir = dirAppend(common.rootDir, common.extractionDir);
    const extractPathProgress = new progress.Bar({
      format: common.fmtProgressBar("loading extraction file paths from " + readDir),
      barsize: 20
    }, progress.Presets.shades_classic);
    extractPathProgress.start(1, 0);
    let filePaths = [];
    for await (const entry of readdirp(readDir)) {
      const {path} = entry;
      filePaths.push({path});
      extractPathProgress.setTotal(filePaths.length);
      extractPathProgress.increment();
    }
    extractPathProgress.stop();
    return filePaths;
  }

  async extractSnippets (filePaths) {
    const extractSnippetProgress = new progress.Bar({
      format: common.fmtProgressBar("extracting snippets from files"),
      barsize: 20
    }, progress.Presets.shades_classic);
    extractSnippetProgress.start(filePaths.length + 1, 0);
    let extractRootPath = dirAppend(common.rootDir, common.extractionDir);
    let snippets = [];
    for (let i = 0; i < filePaths.length; i++) {
      extractSnippetProgress.increment();
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
          let s = new snip.Snippet(id, ext);
          fileSnips.push(s)
        }
      });
      snippets.push(...fileSnips)
    }
    for (let j = 0; j<snippets.length; j++) {
      snippets[j].fmt();
    }
    extractSnippetProgress.increment();
    extractSnippetProgress.stop();
    return snippets;
  }

  async getInsertFilePaths() {
    let writeDir = dirAppend(common.rootDir, this.config.target);
    const insertPathProgress = new progress.Bar({
      format: common.fmtProgressBar("loading insert file paths from " + writeDir),
      barsize: 20
    }, progress.Presets.shades_classic);
    insertPathProgress.start(1, 0);
    let insertFilePaths = [];
    for await (const entry of readdirp(writeDir)) {
      const {path} = entry;
      insertFilePaths.push({path});
      insertPathProgress.setTotal(insertFilePaths.length);
      insertPathProgress.increment();
    }
    insertPathProgress.stop();
    return insertFilePaths;
  }

  async getInsertFiles(filePaths) {
    const getInsertFilesProgress = new progress.Bar({
      format: common.fmtProgressBar("loading file lines for each insert file"),
      barsize: 20
    }, progress.Presets.shades_classic);
    getInsertFilesProgress.start(filePaths.length, 0);
    let files = [];
    for (let i = 0; i < filePaths.length; i++) {
      files.push(await this.getInsertFileLines(filePaths[i].path));
      getInsertFilesProgress.increment();
    }
    getInsertFilesProgress.stop();
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
    const spliceProgress = new progress.Bar({
        format: common.fmtProgressBar("starting splice operations"),
        barsize: 20
    }, progress.Presets.shades_classic);
    spliceProgress.start(snippets.length, 0);
    for (let i = 0; i < snippets.length; i++) {
      spliceProgress.increment();
      for (let f = 0; f< files.length; f++) {
        files[f] = await this.getSplicedFile(snippets[i], files[f]);
      }
    }
    spliceProgress.stop();
    return files;
  }

  async getSplicedFile(snippet, file) {
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
    let writeFileProgress = new progress.Bar({
      format: common.fmtProgressBar("writing files to " + insertRootPath),
      barsize: 20
    }, progress.Presets.shades_classic);
    writeFileProgress.start(files.length, 0);
    for (let i = 0; i< files.length; i++) {
      let file = files[i];
      let fileString = file.lines.join("\n");
      let writePath = dirAppend(insertRootPath, file.filename);
      const raw = await writeAsync(writePath, fileString);
      writeFileProgress.increment();
    }
    writeFileProgress.stop();
    return;
  }

  async cleanUp() {
    let cleanupProgress = new progress.Bar({
      format: common.fmtProgressBar("cleaning up downloads"),
      barsize: 20
    }, progress.Presets.shades_classic);
    cleanupProgress.start(1, 0);
    let path = dirAppend(common.rootDir, common.extractionDir);
    rimrafAsync(path);
    cleanupProgress.update(1);
    cleanupProgress.stop();
    return;
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

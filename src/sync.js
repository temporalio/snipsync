const { join } = require('path')
const { Octokit } = require('@octokit/rest');
const { promisify } = require('util');
const { eachLine } = require('line-reader');
const {
  extractionDir,
  fmtProgressBar,
  markdownCodeTicks,
  readStart,
  readEnd,
  rootDir,
  writeStart,
  writeEnd
} = require('./common.js');
const {
  writeFile,
  unlink,
  createReadStream
} = require('fs');

const arrayBuffToBuff = require('arraybuffer-to-buffer');
const anzip = require('anzip');
const snip = require('./snippet.js');
const fi = require('./file.js');
const readdirp = require('readdirp');
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
    const octokit = new Octokit()
    this.github = octokit;
  }

  async run() {
    // Download repo as zip file and extract to sync_repos directory
    let getRepoErr = await this.getRepos();
    if (getRepoErr instanceof Error) {
      return getRepoErr;
    }
    // Get the names of all the files in the sync_repos directory
    let extractFP = await this.getExtractionFilePaths();
    if (extractFP instanceof Error) {
      return extractFP;
    }
    // Search each file and scrape the snippets
    let snippets = await this.extractSnippets(extractFP);
    if (snippets instanceof Error) {
      return snippets;
    }
    // Get the names of all the files in the target directory
    let insertFP = await this.getInsertFilePaths();
    if (insertFP instanceof Error) {
      return insertFP;
    }
    // Create an object for each file in the target directory
    let files = await this.getInsertFiles(insertFP);
    if (files instanceof Error) {
      return files;
    }
    // Splice the snippets in the file objects
    let filesToWrite = await this.spliceSnippets(snippets, files);
    // Overwrite the files to the target directory
    let writeFilesErr = await this.writeFiles(filesToWrite);
    if (writeFilesErr instanceof Error) {
      return writeFilesErr;
    }
    // Delete the sync_repos directory
    let cleanUpErr = await this.cleanUp();
    if (cleanUpErr instanceof Error) {
      return cleanUpErr;
    }
    this.logger.info("Snippet sync operation complete!");
    return null;
  }

  async getRepos() {
    await Promise.all(
      this.origins.map(async ({ owner, repo, ref }) => {
        const dlProgress = new progress.Bar({
            format: fmtProgressBar(`downloading repo ${join(owner, repo)}`),
            barsize: 20,
        }, progress.Presets.shades_classic);
        dlProgress.start(3, 0);
        let byteArray = await this.getArchive(owner, repo, ref);
        if (byteArray instanceof Error) {
          return byteArray;
        }
        dlProgress.increment();
        let fileName = `${repo}.zip`;
        let buffer = arrayBuffToBuff(byteArray);
        const raw = await writeAsync(fileName, buffer);
        dlProgress.increment();
        let err = await this.unzip(fileName);
        if (err instanceof Error) {
          return err;
        }
        dlProgress.increment();
        dlProgress.stop();
      })
    );
    return null;
  }

  async unzip(filename) {
    let zipPath = join(rootDir, filename);
    let unzipPath = join(rootDir, extractionDir);
    try {
      await anzip(zipPath, { outputPath: unzipPath });
    } catch(err) {
      return err;
    }
    try{
      await unlinkAsync(zipPath);
    } catch(err) {
      return err;
    }
    return null;
  }

  async getArchive(owner, repo, ref) {
    try {
      const result = await this.github.repos.downloadArchive({
        owner: owner,
        repo: repo,
        ref: ref,
        archive_format: "zipball"
      });
      return result.data;
    } catch(err) {
      return err;
    }
  }

  async getExtractionFilePaths() {
    let readDir = join(rootDir, extractionDir);
    const extractPathProgress = new progress.Bar({
      format: fmtProgressBar("loading extraction file paths from " + readDir),
      barsize: 20
    }, progress.Presets.shades_classic);
    extractPathProgress.start(1, 0);
    let filePaths = [];
    try {
      for await (const entry of readdirp(readDir)) {
        const {path} = entry;
        filePaths.push({path});
        extractPathProgress.setTotal(filePaths.length);
        extractPathProgress.increment();
      }
    } catch(err) {
      return err;
    }
    extractPathProgress.stop();
    return filePaths;
  }

  async extractSnippets (filePaths) {
    const extractSnippetProgress = new progress.Bar({
      format: fmtProgressBar("extracting snippets from files"),
      barsize: 20
    }, progress.Presets.shades_classic);
    extractSnippetProgress.start(filePaths.length + 1, 0);
    let extractRootPath = join(rootDir, extractionDir);
    let snippets = [];
    for (let i = 0; i < filePaths.length; i++) {
      extractSnippetProgress.increment();
      let item = filePaths[i];
      let ext = determineExtension(item.path);
      let path = join(extractRootPath, item.path);
      let capture = false;
      let fileSnipsCount = 0;
      let fileSnips = [];
      try {
        await eachLineAsync(path, (line) => {
          if (line.includes(readEnd)) {
            capture = false;
            fileSnipsCount++;
          }
          if (capture) {
            fileSnips[fileSnipsCount].lines.push(line);
          }
          if (line.includes(readStart)) {
            capture = true;
            let id = extractID(line);
            let s = new snip.Snippet(id, ext);
            fileSnips.push(s)
          }
        });
      } catch(err) {
        return err;
      }
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
    let writeDir = join(rootDir, this.config.target);
    const insertPathProgress = new progress.Bar({
      format: fmtProgressBar("loading insert file paths from " + writeDir),
      barsize: 20
    }, progress.Presets.shades_classic);
    insertPathProgress.start(1, 0);
    let insertFilePaths = [];
    try {
      for await (const entry of readdirp(writeDir)) {
        const {path} = entry;
        insertFilePaths.push({path});
        insertPathProgress.setTotal(insertFilePaths.length);
        insertPathProgress.increment();
      }
    } catch(err) {
      return err;
    }
    insertPathProgress.stop();
    return insertFilePaths;
  }

  async getInsertFiles(filePaths) {
    const getInsertFilesProgress = new progress.Bar({
      format: fmtProgressBar("loading file lines for each insert file"),
      barsize: 20
    }, progress.Presets.shades_classic);
    getInsertFilesProgress.start(filePaths.length, 0);
    let files = [];
    try {
      for (let i = 0; i < filePaths.length; i++) {
        files.push(await this.getInsertFileLines(filePaths[i].path));
        getInsertFilesProgress.increment();
      }
    } catch(err) {
      return err;
    }
    getInsertFilesProgress.stop();
    return files;
  }

  async getInsertFileLines(filename) {
    let insertRootPath = join(rootDir, this.config.target);
    let path = join(insertRootPath, filename);
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
        format: fmtProgressBar("starting splice operations"),
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
      if (line.includes(writeStart)) {
        let id = insertID(line);
        if (id == snippet.id) {
          spliceStart = fileLineNumber;
          lookForStop = true
        }
      }
      if (line.includes(writeEnd) && lookForStop) {
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
    let insertRootPath = join(rootDir, this.config.target);
    let writeFileProgress = new progress.Bar({
      format: fmtProgressBar("writing files to " + insertRootPath),
      barsize: 20
    }, progress.Presets.shades_classic);
    writeFileProgress.start(files.length, 0);
    try {
      for (let i = 0; i< files.length; i++) {
        let file = files[i];
        let fileString = file.lines.join("\n");
        fileString = fileString + "\n";
        let writePath = join(insertRootPath, file.filename);
        const raw = await writeAsync(writePath, fileString);
        writeFileProgress.increment();
      }
    } catch(err) {
      return err;
    }
    writeFileProgress.stop();
    return null;
  }

  async cleanUp() {
    let cleanupProgress = new progress.Bar({
      format: fmtProgressBar("cleaning up downloads"),
      barsize: 20
    }, progress.Presets.shades_classic);
    cleanupProgress.start(1, 0);
    let path = join(rootDir, extractionDir);
    try {
      rimrafAsync(path);
      cleanupProgress.update(1);
    } catch(err) {
      return err;
    }
    cleanupProgress.stop();
    return null;
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

module.exports = { Sync };

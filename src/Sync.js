const { join } = require('path')
const { Octokit } = require('@octokit/rest');
const { promisify } = require('util');
const { eachLine } = require('line-reader');
const { Snippet } = require('./Snippet');
const { File } = require('./File');
const { Repo } = require('./Repo');
const {
  extractionDir,
  fmtProgressBar,
  markdownCodeTicks,
  readStart,
  readEnd,
  rootDir,
  writeStart,
  writeEnd,
} = require('./common');
const {
  writeFile,
  unlink,
  createReadStream,
} = require('fs');
const arrayBuffToBuff = require('arraybuffer-to-buffer');
const anzip = require('anzip');
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
    // Download repo as zip file.
    // Extract to sync_repos directory.
    // Get repository details and file paths.
    const repositories = await this.getRepos();

    // Search each file and scrape the snippets
    let snippets = await this.extractSnippets(repositories);

    // Get the names of all the files in the target directory
    let insertFP = await this.getTargetFilePaths();

    // Create an object for each file in the target directory
    let files = await this.getTargetFiles(insertFP);

    // Splice the snippets in the file objects
    let filesToWrite = await this.spliceSnippets(snippets, files);

    // Overwrite the files to the target directory
    await this.writeFiles(filesToWrite);

    // Delete the sync_repos directory
    await this.cleanUp();

    this.logger.info('Snippet sync operation complete!');
    return;
  }

  async clear() {
    let filePaths = await this.getTargetFilePaths();
    let files = await this.getTargetFiles(filePaths);
    let filesToWrite = await this.clearSnippets(files);
    await this.writeFiles(filesToWrite);
    this.logger.info('Snippets have been cleared.')
  }

  async getRepos() {
    let repositories = [];
    await Promise.all(
      this.origins.map(async ({ owner, repo, ref }) => {
        let repository = new Repo(owner, repo, ref);
        const dlProgress = new progress.Bar({
            format: fmtProgressBar(`downloading repo ${join(owner, repo)}`),
            barsize: 20,
        }, progress.Presets.shades_classic);
        dlProgress.start(3, 0);
        let byteArray = await this.getArchive(owner, repo, ref);
        dlProgress.increment();
        const fileName = `${repo}.zip`;
        let buffer = arrayBuffToBuff(byteArray);
        const raw = await writeAsync(fileName, buffer);
        dlProgress.increment();
        repository.filePaths = await this.unzip(fileName);
        repositories.push(repository);
        dlProgress.increment();
        dlProgress.stop();
      })
    );
    return repositories;
  }

  async unzip(filename) {
    const zipPath = join(rootDir, filename);
    const unzipPath = join(rootDir, extractionDir);
    const { files } = await anzip(zipPath, { outputPath: unzipPath });
    await unlinkAsync(zipPath);
    return files;
  }

  async getArchive(owner, repo, ref) {
    const result = await this.github.repos.downloadArchive({
      owner: owner,
      repo: repo,
      ref: ref,
      archive_format: 'zipball'
    });
    return result.data;
  }

  async extractSnippets (repositories) {
    let snippets = [];
    await Promise.all(
      repositories.map(async ({ owner, repo, ref, filePaths }) => {
        const extractSnippetProgress = new progress.Bar({
          format: fmtProgressBar(`extracting snippets from ${repo}`),
          barsize: 20
        }, progress.Presets.shades_classic);
        extractSnippetProgress.start(filePaths.length + 1, 0);
        const extractRootPath = join(rootDir, extractionDir);
        for (let i = 0; i < filePaths.length; i++) {
          extractSnippetProgress.increment();
          let item = filePaths[i];
          let ext = determineExtension(item.name);
          let path = join(item.directory, item.name);
          path = join(extractRootPath, path);
          let capture = false;
          let fileSnipsCount = 0;
          let fileSnips = [];
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
              let s = new Snippet(id, ext, owner, repo, ref, item);
              fileSnips.push(s)
            }
          });
          snippets.push(...fileSnips)
        }
        extractSnippetProgress.increment();
        extractSnippetProgress.stop();
      })
    );
    for (let j = 0; j<snippets.length; j++) {
      snippets[j].fmt(this.config.features.enable_source_link);
    }
    return snippets;
  }

  async getTargetFilePaths() {
    const writeDir = join(rootDir, this.config.target);
    const insertPathProgress = new progress.Bar({
      format: fmtProgressBar('loading target file paths from ' + writeDir),
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

  async getTargetFiles(filePaths) {
    const getInsertFilesProgress = new progress.Bar({
      format: fmtProgressBar('loading file lines for each insert file'),
      barsize: 20
    }, progress.Presets.shades_classic);
    getInsertFilesProgress.start(filePaths.length, 0);
    let files = [];
    for (let i = 0; i < filePaths.length; i++) {
      files.push(await this.getTargetFileLines(filePaths[i].path));
      getInsertFilesProgress.increment();
    }
    getInsertFilesProgress.stop();
    return files;
  }

  async getTargetFileLines(filename) {
    const insertRootPath = join(rootDir, this.config.target);
    const path = join(insertRootPath, filename);
    let file = new File(filename);
    let fileLines = [];
    await eachLineAsync(path, (line) => {
      fileLines.push(line);
    });
    file.lines = fileLines;
    return file;
  }

  async spliceSnippets(snippets, files) {
    const spliceProgress = new progress.Bar({
        format: fmtProgressBar('starting splice operations'),
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

  async clearSnippets(files) {
    const clearProgress = new progress.Bar({
        format: fmtProgressBar('starting clear operations'),
        barsize: 20
    }, progress.Presets.shades_classic);
    clearProgress.start(files.length, 0);
    for (let f = 0; f< files.length; f++) {
      files[f] = await this.getClearedFile(files[f]);
      clearProgress.increment();
    }
    clearProgress.stop();
    return files;
  }

  async getClearedFile(file) {
    let omit = false
    let newFileLines = []
    for (let i = 0; i < file.lines.length; i++) {
      let line = file.lines[i];
      if (line.includes(writeEnd)) {
        omit = false;
      }
      if(!omit){
        newFileLines.push(line);
      }
      if (line.includes(writeStart)) {
        omit = true;
      }
    }
    file.lines = newFileLines;
    return file;
  }

  async writeFiles(files) {
    const insertRootPath = join(rootDir, this.config.target);
    const writeFileProgress = new progress.Bar({
      format: fmtProgressBar('writing files to ' + insertRootPath),
      barsize: 20
    }, progress.Presets.shades_classic);
    writeFileProgress.start(files.length, 0);
    for (let i = 0; i< files.length; i++) {
      const file = files[i];
      const fileString = `${file.lines.join('\n')}\n`;
      const writePath = join(insertRootPath, file.filename);
      const raw = await writeAsync(writePath, fileString);
      writeFileProgress.increment();
    }
    writeFileProgress.stop();
    return;
  }

  async cleanUp() {
    let cleanupProgress = new progress.Bar({
      format: fmtProgressBar('cleaning up downloads'),
      barsize: 20
    }, progress.Presets.shades_classic);
    cleanupProgress.start(1, 0);
    let path = join(rootDir, extractionDir);
    rimrafAsync(path);
    cleanupProgress.update(1);
    cleanupProgress.stop();
  }
}

function determineExtension(path) {
  let parts = path.split('.');
  return parts[parts.length - 1];
}

function extractID(line) {
  let parts = line.split(' ');
  return parts[2];
}

function insertID(line) {
  let parts = line.split(' ')
  let part = parts[parts.length - 1]
  return part.replace('-->', '');
}

module.exports = { Sync };

const { join, basename, dirname } = require("path");
const { Octokit } = require("@octokit/rest");
const { promisify } = require("util");
const { eachLine } = require("line-reader");
const {
  fmtStartCodeBlock,
  markdownCodeTicks,
  extractionDir,
  fmtProgressBar,
  readStart,
  readEnd,
  rootDir,
  writeStart,
  writeStartClose,
  writeEnd,
} = require("./common");
const { writeFile, unlink } = require("fs");
const dedent = require("dedent");
const path = require("path");
const arrayBuffToBuff = require("arraybuffer-to-buffer");
const anzip = require("anzip");
const readdirp = require("readdirp");
const rimraf = require("rimraf");
const progress = require("cli-progress");
const glob = require("glob");

// Convert dependency functions to return promises
const writeAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);
const eachLineAsync = promisify(eachLine);
const rimrafAsync = promisify(rimraf);
// Snippet class contains info and methods used for passing and formatting code snippets
class Snippet {
  constructor(id, ext, owner, repo, ref, filePath) {
    this.id = id;
    this.ext = ext;
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.filePath = filePath;
    this.lines = [];
  }
  // fmt creates an array of file lines from the Snippet variables
  fmt(config) {
    const lines = [];
    if (config.enable_source_link) {
      lines.push(this.fmtSourceLink());
    }
    if (config.enable_code_block) {
      let textline = fmtStartCodeBlock(this.ext);
      if (config.highlights !== undefined) {
        textline = `${textline} {${config.highlights}}`;
      }
      lines.push(textline);
    }
    if (config.select !== undefined) {
      const selectedLines = selectLines(config.select, this.lines);
      lines.push(...selectedLines);
    } else {
      lines.push(...this.lines);
    }
    if (config.enable_code_block) {
      lines.push(markdownCodeTicks);
    }
    return lines;
  }
  // fmtSourceLink creates a markdown link to the source of the snippet
  fmtSourceLink() {
    const url = this.buildURL();
    const buildPath = this.buildPath();
    const link = `[${buildPath}](${url})`;
    return link;
  }
  // buildPath creates a string that represents the relative path to the snippet
  buildPath() {
    const sourceURLParts = this.filePath.directory.split("/");
    const buildPath = [
      ...sourceURLParts.slice(1, sourceURLParts.length),
      this.filePath.name,
    ].join("/");
    return buildPath;
  }
  // buildURL creates a url to the snippet source location
  buildURL() {
    const sourceURLParts = this.filePath.directory.split("/");
    let ref = "";
    if (this.ref !== "" && this.ref !== undefined) {
      ref = this.ref;
    } else {
      ref = "master";
    }
    const url = [
      "https://github.com",
      this.owner,
      this.repo,
      "blob",
      ref,
      ...sourceURLParts.slice(1, sourceURLParts.length),
      this.filePath.name,
    ].join("/");
    return url;
  }
}
// Repo is the class that maps repo configuration to local filepaths
class Repo {
  constructor(owner, repo, ref) {
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.filePaths = [];
  }
}
// File is the class that contains a filename and lines of the file
class File {
  constructor(filename, fullpath) {
    this.filename = filename;
    this.fullpath = fullpath;
    this.lines = [];
  }
  // fileString converts the array of lines into a string
  fileString(dedentCode = false) {
    let lines = `${this.lines.join("\n")}\n`;

    if (dedentCode) {
      lines = dedent(lines);
    }

    return lines;
  }
}
class ProgressBar {
  constructor() {
    this.bar = new progress.Bar(
      {
        format: `✂️ | {bar} | {percentage}% | {value}/{total} chunks | operation: {operation}`,
      },
      progress.Presets.shades_classic
    );
    this.startValue = 0;
    this.totalValue = 0;
  }
  // start sets the initial text display
  start(operation) {
    this.bar.start(this.totalValue, this.startValue, {
      operation: `${operation}`,
    });
  }
  // adds to the total chunks
  updateTotal(valueAdd) {
    this.totalValue = this.totalValue + valueAdd;
    this.bar.setTotal(this.totalValue);
  }
  // increments completed chunks by 1
  increment() {
    this.bar.increment();
  }
  // updates the text display
  updateOperation(operation) {
    this.bar.update({ operation: `${operation}` });
  }
  // stops the progress bar
  stop() {
    this.bar.stop();
  }
}
// Sync is the class of methods that can be used to do the following:
// Download repos, extract code snippets, merge snippets, and clear snippets from target files
class Sync {
  constructor(cfg, logger) {
    this.config = cfg;
    this.origins = cfg.origins;
    this.logger = logger;
    const octokit = new Octokit();
    this.github = octokit;
    this.progress = new ProgressBar();
  }
  // run is the main method of the Sync class that downloads, extracts, and merges snippets
  async run() {
    this.progress.start("starting snipsync operations");
    // Download repo as zip file.
    // Extract to sync_repos directory.
    // Get repository details and file paths.
    const repositories = await this.getRepos();
    // Search each origin file and scrape the snippets
    const snippets = await this.extractSnippets(repositories);
    // Get the infos (name, path) of all the files in the target directories
    let targetFiles = await this.getTargetFilesInfos();
    // Add the lines of each file
    targetFiles = await this.getTargetFilesLines(targetFiles);
    // Splice the snippets in the file objects
    const splicedFiles = await this.spliceSnippets(snippets, targetFiles);
    // Overwrite the files to the target directories
    await this.writeFiles(splicedFiles);
    // Delete the sync_repos directory
    await this.cleanUp();
    this.progress.updateOperation("done");
    this.progress.stop();
    this.logger.info("snipsync operation complete");
    return;
  }
  // clear is the method that will remove snippets from target merge files
  async clear() {
    this.progress.start("clearing snippets from files");
    const filePaths = await this.getTargetFilesInfos();
    const files = await this.getTargetFilesLines(filePaths);
    const filesToWrite = await this.clearSnippets(files);
    await this.writeFiles(filesToWrite);
    this.progress.updateOperation("done");
    this.progress.stop();
    this.logger.info("snippets have been cleared.");
  }
  // getRepos is the method that downloads all of the Github repos
  async getRepos() {
    const repositories = [];
    this.progress.updateOperation("retrieving source files");
    this.progress.updateTotal(this.origins.length);
    await Promise.all(
      this.origins.map(async (origin) => {
        if ("files" in origin) {
          repositories.push({
            owner: "local",
            repo: "local",
            filePaths: origin.files.flatMap((pattern) =>
              glob.sync(pattern).map((f) => ({
                name: basename(f),
                directory: dirname(f),
              }))
            ),
          });
          return;
        }
        if (!("owner" in origin && "repo" in origin)) {
          throw new Error(`Invalid origin: ${JSON.stringify(origin)}`);
        }
        const { owner, repo, ref } = origin;
        const repository = new Repo(owner, repo, ref);
        const byteArray = await this.getArchive(owner, repo, ref);
        const fileName = `${repo}.zip`;
        const buffer = arrayBuffToBuff(byteArray);
        await writeAsync(fileName, buffer);
        repository.filePaths = await this.unzip(fileName);
        repositories.push(repository);
        this.progress.increment();
      })
    );
    return repositories;
  }
  // unzip unzips the Github repo archive
  async unzip(filename) {
    const zipPath = join(rootDir, filename);
    const unzipPath = join(rootDir, extractionDir);
    const { files } = await anzip(zipPath, { outputPath: unzipPath });
    await unlinkAsync(zipPath);
    return files;
  }
  // getArchive gets the Github repo archive from Github
  async getArchive(owner, repo, ref) {
    const result = await this.github.repos.downloadZipballArchive({
      owner,
      repo,
      ref,
    });
    return result.data;
  }
  // extractSnippets returns an array of code snippets that are found in the repositories
  async extractSnippets(repositories) {
    const snippets = [];
    this.progress.updateOperation("extracting snippets");
    await Promise.all(
      repositories.map(async ({ owner, repo, ref, filePaths }) => {
        this.progress.updateTotal(filePaths.length);
        const extractRootPath = join(rootDir, extractionDir);
        for (const item of filePaths) {
          const ext = determineExtension(item.name);
          let itemPath = join(item.directory, item.name);
          if (!(owner === "local" && repo === "local")) {
            itemPath = join(extractRootPath, itemPath);
          }
          let capture = false;
          let fileSnipsCount = 0;
          const fileSnips = [];
          await eachLineAsync(itemPath, (line) => {
            if (line.includes(readEnd)) {
              capture = false;
              fileSnipsCount++;
            }
            if (capture) {
              fileSnips[fileSnipsCount].lines.push(line);
            }
            if (line.includes(readStart)) {
              capture = true;
              const id = extractReadID(line);
              const snip = new Snippet(id, ext, owner, repo, ref, item);
              fileSnips.push(snip);
            }
          });
          snippets.push(...fileSnips);
          this.progress.increment();
        }
      })
    );
    return snippets;
  }
  // getTargetFilesInfos identifies the paths to the target write files
  async getTargetFilesInfos() {
    this.progress.updateOperation("gathering information of target files");
    this.progress.updateTotal(this.config.targets.length);
    const targetFiles = [];
    const allowed_extensions = this.config.features.allowed_target_extensions;
    for (const target of this.config.targets) {
      const targetDirPath = join(rootDir, target);
      for await (const entry of readdirp(targetDirPath)) {
        // include everything if the allowed exetnsions list is empty.
        if (
          allowed_extensions.length === 0 ||
          allowed_extensions.includes(path.extname(entry.basename))
        ) {
          const file = new File(entry.basename, entry.fullPath);
          targetFiles.push(file);
        }
      }
      this.progress.increment();
    }
    return targetFiles;
  }
  // getTargetFilesLines loops through the files and calls readLines on each one
  async getTargetFilesLines(targetFiles) {
    this.progress.updateOperation("reading target files");
    this.progress.updateTotal(targetFiles.length);
    const updatedFiles = [];
    for (const targetFile of targetFiles) {
      updatedFiles.push(await this.readLines(targetFile));
      this.progress.increment();
    }
    return updatedFiles;
  }
  // readLines reads each line of the file
  async readLines(targetFile) {
    const fileLines = [];
    await eachLineAsync(targetFile.fullpath, (line) => {
      fileLines.push(line);
    });
    targetFile.lines = fileLines;
    return targetFile;
  }
  // spliceSnippets merges the snippet into the target location of a file
  async spliceSnippets(snippets, files) {
    this.progress.updateOperation("splicing snippets with targets");
    this.progress.updateTotal(snippets.length);
    for (const snippet of snippets) {
      for (let file of files) {
        file = await this.getSplicedFile(snippet, file);
      }
      this.progress.increment();
    }
    return files;
  }
  // getSplicedFile returns the the spliced file
  async getSplicedFile(snippet, file) {
    const staticFile = file;
    let dynamicFile = file;
    let fileLineNumber = 1;
    let lookForStop = false;
    let spliceStart = 0;
    let config;
    for (let [idx, _] of staticFile.lines.entries()) {
      const line = file.lines[idx];
      if (line.includes(writeStart)) {
        const extracted = extractWriteIDAndConfig(line);
        if (extracted.id === snippet.id) {
          config = overwriteConfig(this.config.features, extracted.config);
          spliceStart = fileLineNumber;
          lookForStop = true;
        }
      }
      if (line.includes(writeEnd) && lookForStop) {
        dynamicFile = await this.spliceFile(
          spliceStart,
          fileLineNumber,
          snippet,
          dynamicFile,
          config
        );
        lookForStop = false;
      }
      fileLineNumber++;
    }
    return dynamicFile;
  }
  // spliceFile merges an individual snippet into the file
  async spliceFile(start, end, snippet, file, config) {
    const rmlines = end - start;
    file.lines.splice(start, rmlines - 1, ...snippet.fmt(config));
    return file;
  }
  // clearSnippets loops through target files to remove snippets
  async clearSnippets(files) {
    this.progress.updateOperation("removing splices");
    this.progress.updateTotal(files.length);
    for (let file of files) {
      file = await this.getClearedFile(file);
      this.progress.increment();
    }
    return files;
  }
  // getClearedFile removes snippet lines from a specific file
  async getClearedFile(file) {
    let omit = false;
    const newFileLines = [];
    for (const line of file.lines) {
      if (line.includes(writeEnd)) {
        omit = false;
      }
      if (!omit) {
        newFileLines.push(line);
      }
      if (line.includes(writeStart)) {
        omit = true;
      }
    }
    file.lines = newFileLines;
    return file;
  }
  // writeFiles writes file lines to target files
  async writeFiles(files) {
    this.progress.updateOperation("writing updated files");
    this.progress.updateTotal(files.length);
    for (const file of files) {
      await writeAsync(
        file.fullpath,
        file.fileString(this.config.features.enable_code_dedenting)
      );
      this.progress.increment();
    }
    return;
  }
  // cleanUp deletes temporary files and folders
  async cleanUp() {
    this.progress.updateOperation("cleaning up");
    this.progress.updateTotal(1);
    const filePath = join(rootDir, extractionDir);
    rimrafAsync(filePath);
    this.progress.increment();
    return;
  }
}
// determineExtension returns the file extension
function determineExtension(filePath) {
  const parts = filePath.split(".");
  return parts[parts.length - 1];
}

// See: https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeStringRegexp(string) {
  return string.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}

const readMatchRegexp = new RegExp(
  escapeStringRegexp(readStart) + /\s+(\S+)/.source
);

const writeMatchRegexp = new RegExp(
  escapeStringRegexp(writeStart) +
    /\s+(\S+)(?:\s+(.+))?\s*/.source +
    escapeStringRegexp(writeStartClose)
);

// extractReadID uses regex to exract the id from a string
function extractReadID(line) {
  const matches = line.match(readMatchRegexp);
  return matches[1];
}

// extractWriteIDAndConfig uses regex to exract the id from a string
function extractWriteIDAndConfig(line) {
  const matches = line.match(writeMatchRegexp);
  return {
    id: matches[1],
    config: matches[2] ? JSON.parse(matches[2]) : undefined,
  };
}

// overwriteConfig uses values if provided in the snippet placeholder
function overwriteConfig(current, extracted) {
  let config = {};

  config.enable_source_link =
    extracted?.enable_source_link ?? true
      ? current.enable_source_link
      : extracted.enable_source_link;

  config.enable_code_block =
    extracted?.enable_code_block ?? true
      ? current.enable_code_block
      : extracted.enable_code_block;

  if (extracted?.highlightedLines ?? undefined) {
    config.highlights = extracted.highlightedLines;
  }

  if (extracted?.selectedLines) {
    config.select = extracted.selectedLines;
  }

  return config;
}

function selectLines(selectNumbers, lines, fileExtension) {
  let newLines = [];
  const commentChar = fileExtension === "py" ? "#" : "//";
  for (const sn of selectNumbers) {
    let skip = false;
    let nums = [];
    if (sn.includes("-")) {
      const strs = sn.split("-");
      nums = [parseInt(strs[0]) - 1, parseInt(strs[1])];
    } else {
      const num = parseInt(sn);
      nums = [num - 1, num];
    }
    if (nums[0] != 0) {
      newLines.push(`${commentChar} ...`);
    }
    const capture = lines.slice(nums[0], nums[1]);
    newLines.push(...capture);
  }
  return newLines;
}

module.exports = { Sync };

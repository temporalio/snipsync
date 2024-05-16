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
  snipFileStart,
  snipFileEnd,
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
      const selectedLines = selectLines(config.select, this.lines, this.ext);
      lines.push(...selectedLines);
    } else if (!config.startPattern && !config.endPattern) {
      lines.push(...this.lines);
    } else {
      // use the patterns to grab the content specified.
      const pattern = new RegExp(`(${config.startPattern}[\\s\\S]+${config.endPattern})`);
      const match = this.lines.join("\n").match(pattern);
      if (match !== null) {
        let filteredLines = match[1].split("\n");
        lines.push(...filteredLines);
      }
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
      ref = "main";
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
  constructor(rtype, owner, repo, ref) {
    this.rtype = rtype;
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
        if ('files' in origin) {
          const pattern = origin.files.pattern;
          const filePaths = glob.sync(pattern).map((f) => ({
            name: basename(f), directory: dirname(f),
          }));
          repositories.push({
            rtype: 'local',
            owner: origin.files.owner,
            repo: origin.files.repo,
            ref: origin.files.ref,
            filePaths:  filePaths,
          });
          return;
        }
        if ('file' in origin) {
          const { owner, repo, ref } = origin.file;
          repositories.push({
            rtype: 'file',
            owner,
            repo,
            ref,
            filePaths: [],
          });
          return;
        }
        if (!("owner" in origin && "repo" in origin)) {
          throw new Error(`Invalid origin: ${JSON.stringify(origin)}`);
        }
        const { owner, repo, ref } = origin;
        const repository = new Repo('remote', owner, repo, ref);
        const byteArray = await this.getArchive(owner, repo, ref);
        const fileName = `${repo}.zip`;
        const zipBuffer = arrayBuffToBuff(byteArray);
        await this.saveArchive(fileName, zipBuffer);
        const extractionPath = join(extractionDir, repo);
        await this.extractArchive(fileName, extractionPath);
        const paths = await this.getFilePaths(extractionPath);
        repository.filePaths = paths.map((path) => ({
          name: basename(path),
          directory: dirname(path),
        }));
        repositories.push(repository);
        await this.cleanArchive(fileName);
      })
    );
    return repositories;
  }

  // getArchive is a method that downloads a GitHub repo as a zip file
  async getArchive(owner, repo, ref) {
    this.logger.info(
      `downloading archive from https://github.com/${owner}/${repo}`
    );
    const { data } = await this.github.repos.downloadZipballArchive({
      owner,
      repo,
      ref,
    });
    return data;
  }

  // saveArchive is a method that writes a zip file to the extraction directory
  async saveArchive(fileName, byteArray) {
    const fullPath = join(rootDir, fileName);
    await writeAsync(fullPath, byteArray);
    return;
  }

  // extractArchive is a method that unzips a file to the extraction directory
  async extractArchive(fileName, extractionPath) {
    const zipPath = join(rootDir, fileName);
    const buffer = await promisify(anzip)(zipPath);
    await Promise.all(
      buffer.files.map(async (file) => {
        const filePath = path.join(extractionPath, file.path);
        await writeAsync(filePath, file.buffer);
      })
    );
    return;
  }

  // getFilePaths returns an array of the filenames for the files extracted from the repos
  async getFilePaths(repoPath) {
    const paths = [];
    for await (const entry of readdirp(repoPath, { type: "files" })) {
      paths.push(entry.fullPath);
    }
    return paths;
  }

  // cleanArchive deletes the zip file in the sync_repos directory
  async cleanArchive(fileName) {
    const zipPath = join(rootDir, fileName);
    await unlinkAsync(zipPath);
    return;
  }

  // extractSnippets is the method that retrieves code snippets from the downloaded repos
  async extractSnippets(repositories) {
    const snippets = [];
    this.progress.updateOperation("extracting snippets");
    await Promise.all(
      repositories.map(async (repo) => {
        if (!repo.filePaths) {
          return;
        }
        await Promise.all(
          repo.filePaths.map(async (filePath) => {
            const snippetsFromFile = await this.extractSnippetsFromFile(
              repo,
              filePath
            );
            snippets.push(...snippetsFromFile);
          })
        );
      })
    );
    this.progress.updateTotal(snippets.length);
    return snippets;
  }

  // extractSnippetsFromFile reads a file and finds code snippets marked by comments
  async extractSnippetsFromFile(repo, filePath) {
    const snippets = [];
    const { owner, repo: repoName, ref } = repo;
    const idRegex = new RegExp(/\s*\/\/\s*<(\w+)>/);
    const endIdRegex = new RegExp(/\s*\/\/\s*<\/(\w+)>/);
    const file = new File(filePath.name, filePath.directory);
    let snippet = null;
    await eachLineAsync(join(filePath.directory, filePath.name), (line) => {
      if (idRegex.test(line)) {
        const match = line.match(idRegex);
        const id = match[1];
        snippet = new Snippet(
          id,
          path.extname(filePath.name).slice(1),
          owner,
          repoName,
          ref,
          filePath
        );
      }
      if (snippet !== null) {
        snippet.lines.push(line);
      }
      if (endIdRegex.test(line)) {
        snippets.push(snippet);
        snippet = null;
      }
    });
    return snippets;
  }

  // getTargetFilesInfos gets the filepaths for all target files in the configured directories
  async getTargetFilesInfos() {
    const targetFilesInfos = [];
    await Promise.all(
      this.config.targets.map(async (target) => {
        const pattern = path.join(target, "**/*");
        const matches = glob.sync(pattern).map((f) => ({
          filename: path.basename(f),
          fullpath: path.dirname(f),
        }));
        targetFilesInfos.push(...matches);
      })
    );
    return targetFilesInfos;
  }

  // getTargetFilesLines reads the target files and adds the lines to the file object
  async getTargetFilesLines(targetFiles) {
    await Promise.all(
      targetFiles.map(async (file) => {
        file.lines = [];
        await eachLineAsync(join(file.fullpath, file.filename), (line) => {
          file.lines.push(line);
        });
      })
    );
    return targetFiles;
  }

  // spliceSnippets merges the code snippets into the target files
  async spliceSnippets(snippets, targetFiles) {
    this.progress.updateOperation("splicing code snippets");
    const splicedFiles = await Promise.all(
      targetFiles.map(async (file) => {
        const splicedFile = await this.getSplicedFile(snippets, file);
        this.progress.increment();
        return splicedFile;
      })
    );
    return splicedFiles;
  }

  // getSplicedFile merges snippets into a single file
  async getSplicedFile(snippets, file) {
    const staticFile = file;
    let dynamicFile = file;
    let fileLineNumber = 1;
    let lookForStop = false;
    let spliceStart = 0;
    let config;
    for (let [idx, _] of staticFile.lines.entries()) {
      const line = file.lines[idx];
      if (line.includes(writeStart) || line.includes(snipFileStart)) {
        const extracted = extractWriteIDAndConfig(line);
        if (extracted.id === null) {
          const snipMatch = line.match(
            /<!--SNIPFILE (https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/([^ ]+)) -->/
          );
          if (snipMatch) {
            const [url, , owner, repo, ref, filePath] = snipMatch;
            extracted.id = filePath;
            extracted.config = {
              enable_source_link: this.config.features.enable_source_link,
              enable_code_block: this.config.features.enable_code_block,
              allowed_target_extensions: this.config.features.allowed_target_extensions,
              enable_code_dedenting: this.config.features.enable_code_dedenting,
            };
            const byteArray = await this.getFileContent(owner, repo, ref, filePath);
            const content = arrayBuffToBuff(byteArray).toString();
            const fileLines = content.split('\n');
            const snippet = new Snippet(filePath, path.extname(filePath).substring(1), owner, repo, ref, {
              directory: dirname(filePath),
              name: basename(filePath),
            });
            snippet.lines = fileLines;
            snippets.push(snippet);
          }
        }
        if (extracted.id !== null) {
          const snippet = snippets.find((s) => s.id === extracted.id);
          if (snippet) {
            config = overwriteConfig(this.config.features, extracted.config);
            spliceStart = fileLineNumber;
            lookForStop = true;
          }
        }
      }
      if ((line.includes(writeEnd) || line.includes(snipFileEnd)) && lookForStop) {
        const snippet = snippets.find((s) => s.id === extracted.id);
        if (snippet) {
          dynamicFile = await this.spliceFile(
            spliceStart,
            fileLineNumber,
            snippet,
            dynamicFile,
            config
          );
          lookForStop = false;
        }
      }
      fileLineNumber++;
    }
    return dynamicFile;
  }

  // spliceFile inserts the snippets into the file
  async spliceFile(start, end, snippet, file, config) {
    const fileLines = file.lines;
    const head = fileLines.slice(0, start);
    const tail = fileLines.slice(end, fileLines.length);
    const snippetLines = snippet.fmt(config);
    const mergedLines = head.concat(snippetLines, tail);
    const mergedFile = new File(file.filename, file.fullpath);
    mergedFile.lines = mergedLines;
    return mergedFile;
  }

  // writeFiles writes the spliced file objects to the target directories
  async writeFiles(files) {
    this.progress.updateOperation("writing files");
    await Promise.all(
      files.map(async (file) => {
        const output = file.fileString(this.config.features.enable_code_dedenting);
        const fullpath = path.join(file.fullpath, file.filename);
        await writeAsync(fullpath, output);
      })
    );
    return;
  }

  // clearSnippets removes code snippets from the target files
  async clearSnippets(files) {
    const clearedFiles = files.map((file) => {
      const clearedLines = file.lines.filter(
        (line) => !line.includes(writeStart) && !line.includes(writeEnd)
      );
      const clearedFile = new File(file.filename, file.fullpath);
      clearedFile.lines = clearedLines;
      return clearedFile;
    });
    return clearedFiles;
  }

  // cleanUp deletes the extraction directory
  async cleanUp() {
    await rimrafAsync(extractionDir);
    return;
  }
}

// selectLines uses configuration parameters to select specific lines from a file
function selectLines(select, lines) {
  const selectedLines = [];
  select.forEach((selection) => {
    if (Array.isArray(selection)) {
      selectedLines.push(...lines.slice(selection[0], selection[1] + 1));
    } else {
      selectedLines.push(lines[selection]);
    }
  });
  return selectedLines;
}

// See: https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeStringRegexp(string) {
  return string.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}

const writeMatchRegexp = new RegExp(
  escapeStringRegexp(writeStart) +
    /\s+(\S+)(?:\s+(.+))?\s*/.source +
    escapeStringRegexp(writeStartClose)
);

// extractWriteIDAndConfig uses regex to extract the id from a string
function extractWriteIDAndConfig(line) {
  const matches = line.match(writeMatchRegexp);
  if (!matches) {
    return { id: null, config: {} };
  }
  let id = matches[1];
  let config = {};
  try {
    config = matches[2] ? JSON.parse(matches[2]) : undefined;
  } catch {
    console.error(`Unable to parse JSON in options for ${id} - ignoring options`);
    config = undefined;
  }
  return { id, config };
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

  config.startPattern = (extracted?.startPattern ?? false) ? extracted.startPattern : false;
  config.endPattern = (extracted?.endPattern ?? false) ? extracted.endPattern : false;

  return config;
}

module.exports = { Sync };

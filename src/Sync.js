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
const rimrafAsync = promisify(rimraf);

// Custom promisified version of eachLine
const eachLineAsync = (filePath, cb) => {
  return new Promise((resolve, reject) => {
    eachLine(filePath, cb, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

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
        const destDir = path.join(rootDir, extractionDir, repo);
        const dest = `${destDir}.zip`;
        const repoPath = `${extractionDir}/${repo}`;
        await writeAsync(dest, arrayBuffToBuff(byteArray));
        await anzip(dest, { outputPath: destDir });
        const filePaths = await readdirp.promise(repoPath, { type: "files" });
        repository.filePaths = filePaths.map((f) => ({
          name: f.basename,
          directory: f.dirname,
        }));
        repositories.push(repository);
        await unlinkAsync(dest);
      })
    );
    this.progress.updateOperation("source files retrieved");
    return repositories;
  }

  // getArchive gets the Github repo as a zip file
  async getArchive(owner, repo, ref = "main") {
    const options = {
      owner,
      repo,
      archive_format: "zipball",
      ref,
    };
    const response = await this.github.repos.downloadArchive(options);
    return response.data;
  }

  // getFileContent gets the content of a Github repo file
  async getFileContent(owner, repo, ref, path) {
    const options = {
      owner,
      repo,
      path,
      ref,
    };
    const response = await this.github.repos.getContent(options);
    const buffer = Buffer.from(response.data.content, "base64");
    return buffer.toString("utf8");
  }

  // extractSnippets scrapes the snippets from the repos
  async extractSnippets(repositories) {
    const snippets = [];
    for (const repo of repositories) {
      for (const filePath of repo.filePaths) {
        const filename = filePath.name;
        const fullpath = path.join(repo.owner, repo.repo, filePath.directory, filename);
        const lines = [];
        await eachLineAsync(fullpath, (line) => {
          lines.push(line);
        });
        const file = new File(filename, fullpath);
        file.lines = lines;
        const updatedSnippets = await this.getSnippets(file, repo);
        snippets.push(...updatedSnippets);
      }
    }
    return snippets;
  }

  // getSnippets reads a file and gets the text between the readStart/readEnd lines
  async getSnippets(file, repo) {
    const snippets = [];
    const { lines } = file;
    let snippetLines = [];
    let recording = false;
    let id = null;
    for (const line of lines) {
      if (line.includes(readEnd)) {
        recording = false;
        const snippet = new Snippet(id, path.extname(file.filename).substring(1), repo.owner, repo.repo, repo.ref, {
          directory: dirname(file.fullpath),
          name: basename(file.fullpath),
        });
        snippet.lines = snippetLines;
        snippets.push(snippet);
        snippetLines = [];
      }
      if (recording) {
        snippetLines.push(line);
      }
      if (line.includes(readStart)) {
        const extracted = extractWriteIDAndConfig(line);
        id = extracted.id;
        recording = true;
      }
    }
    return snippets;
  }

  // getTargetFilesInfos gets the paths to target files
  async getTargetFilesInfos() {
    const filePaths = [];
    for (const targetDir of this.config.target) {
      const files = await readdirp.promise(targetDir, { type: "files" });
      files.forEach((f) => filePaths.push({ filename: f.basename, fullpath: f.fullPath }));
    }
    return filePaths;
  }

  // getTargetFilesLines reads each target file and gets the lines
  async getTargetFilesLines(files) {
    for (const file of files) {
      const lines = [];
      await eachLineAsync(file.fullpath, (line) => {
        lines.push(line);
      });
      file.lines = lines;
    }
    return files;
  }

  // spliceSnippets adds snippets to the target file objects
  async spliceSnippets(snippets, files) {
    this.progress.updateOperation("splicing snippets");
    const splicedFiles = await Promise.all(
      files.map(async (file) => {
        const dynamicFile = await this.getSplicedFile(snippets, file);
        return dynamicFile;
      })
    );
    return splicedFiles;
  }

  // getSplicedFile merges snippets into a single file
  async getSplicedFile(snippets, file) {
    const staticFile = file;
    let dynamicFile = file;
    let fileLineNumber = 0;
    let lookForStop = false;
    let spliceStart = 0;
    let config;
    let currentSnippetId = null;

    for (let [idx, line] of staticFile.lines.entries()) {
      let extracted = extractWriteIDAndConfig(line);
      if (line.includes(writeStart) || line.includes(snipFileStart)) {
        extracted = extractWriteIDAndConfig(line);
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
            const content = await this.getFileContent(owner, repo, ref, filePath);
            const fileLines = content.split("\n");
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
            currentSnippetId = extracted.id;
          }
        }
      }
      if ((line.includes(writeEnd) || line.includes(snipFileEnd)) && lookForStop) {
        const snippet = snippets.find((s) => s.id === currentSnippetId);
        if (snippet) {
          dynamicFile = await this.spliceFile(
            spliceStart,
            fileLineNumber + 1, // +1 to include the line with writeEnd/snipFileEnd
            snippet,
            dynamicFile,
            config
          );
          lookForStop = false;
          currentSnippetId = null;
        }
      }
      fileLineNumber++;
    }
    return dynamicFile;
  }

  // spliceFile inserts the snippets into the file
  async spliceFile(start, end, snippet, file, config) {
    const fileLines = file.lines;
    const head = fileLines.slice(0, start + 1); // +1 to include the writeStart/snipFileStart line
    const tail = fileLines.slice(end); // Include the end marker line
    const snippetLines = snippet.fmt(config);

    // Add separation between snippets
    const separator = ['', '']; // Two empty lines to separate code blocks

    const mergedLines = head.concat(separator, snippetLines, separator, tail);
    const mergedFile = new File(file.filename, file.fullpath);
    mergedFile.lines = mergedLines;
    return mergedFile;
  }

  // writeFiles writes the spliced file objects to the target directories
  async writeFiles(files) {
    this.progress.updateOperation("writing files");
    await Promise.all(
      files.map(async (file) => {
        // Ensure file is an instance of File
        if (!(file instanceof File)) {
          file = new File(file.filename, file.fullpath);
          file.lines = file.lines || [];
        }
        
        const output = file.fileString(this.config.features.enable_code_dedenting);
        const fullpath = path.join(file.fullpath, file.filename);
        await writeAsync(fullpath, output);
      })
    );
    return;
  }

  // clearSnippets clears snippets from the target files
  async clearSnippets(files) {
    const clearedFiles = files.map((file) => {
      const staticFile = file;
      let dynamicFile = file;
      let fileLineNumber = 0;
      let lookForStop = false;
      let spliceStart = 0;
      let currentSnippetId = null;

      for (let [idx, line] of staticFile.lines.entries()) {
        let extracted = extractWriteIDAndConfig(line);
        if (line.includes(writeStart) || line.includes(snipFileStart)) {
          extracted = extractWriteIDAndConfig(line);
          if (extracted.id !== null) {
            spliceStart = fileLineNumber;
            lookForStop = true;
            currentSnippetId = extracted.id;
          }
        }
        if ((line.includes(writeEnd) || line.includes(snipFileEnd)) && lookForStop) {
          const snippet = snippets.find((s) => s.id === currentSnippetId);
          if (snippet) {
            const head = staticFile.lines.slice(0, spliceStart + 1);
            const tail = staticFile.lines.slice(fileLineNumber + 1);
            const mergedLines = head.concat(tail);
            dynamicFile = new File(staticFile.filename, staticFile.fullpath);
            dynamicFile.lines = mergedLines;
            lookForStop = false;
            currentSnippetId = null;
          }
        }
        fileLineNumber++;
      }
      return dynamicFile;
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
    config = matches[2] ? JSON.parse(matches[2]) : {};
  } catch (error) {
    console.error(`Unable to parse JSON in options for ${id} - ignoring options`, error);
  }
  return { id, config };
}

// overwriteConfig uses values if provided in the snippet placeholder
function overwriteConfig(current, extracted) {
  return {
    enable_source_link: extracted?.enable_source_link ?? current.enable_source_link,
    enable_code_block: extracted?.enable_code_block ?? current.enable_code_block,
    highlights: extracted?.highlightedLines ?? current.highlights,
    select: extracted?.selectedLines ?? current.select,
    startPattern: extracted?.startPattern ?? current.startPattern,
    endPattern: extracted?.endPattern ?? current.endPattern,
  };
}

module.exports = { Sync };

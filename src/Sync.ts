import {join} from 'path';
import { Octokit } from "@octokit/rest";
import { promisify } from "util";
import { eachLine } from "line-reader";
import Snippet from "./classes/Snippet";
import File from "./classes/File";
import Repo from "./classes/Repo";
import { extractionDir, fmtProgressBar, readStart, readEnd, rootDir, writeStart, writeEnd } from "./common";
import { writeFile, unlink } from "fs";
import arrayBuffToBuff from "arraybuffer-to-buffer";
import anzip from "anzip";
import readdirp from "readdirp";
import rimraf from "rimraf";
import progress from "cli-progress";
import { ILogger } from 'js-logger';
import { ConfigType, Origins } from '../types';

const writeAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);
const eachLineAsync = promisify(eachLine);
const rimrafAsync = promisify(rimraf);

export default class Sync {
    config: ConfigType;
    origins: Origins[];
    logger: ILogger;
    github: any;
    constructor(cfg: ConfigType, logger: ILogger) {
      this.config = cfg;
      this.origins = cfg.origins;
      this.logger = logger;
      const octokit = new Octokit();
      this.github = octokit;
    }

    async run() {
        // Download repo as zip file.
        // Extract to sync_repos directory.
        // Get repository details and file paths.
        const repositories = await this.getRepos();

        // Search each file and scrape the snippets
        const snippets = await this.extractSnippets(repositories);

        // Get the names of all the files in the target directory
        const insertFP = await this.getTargetFilePaths();

        // Create an object for each file in the target directory
        const files = await this.getTargetFiles(insertFP);

        // Splice the snippets in the file objects
        const filesToWrite = await this.spliceSnippets(snippets, files);

        // Overwrite the files to the target directory
        await this.writeFiles(filesToWrite);

        // Delete the sync_repos directory
        await this.cleanUp();

        this.logger.info("Snippet sync operation complete!");
        return;
      }

      async clear() {
        const filePaths = await this.getTargetFilePaths();
        const files = await this.getTargetFiles(filePaths);
        const filesToWrite = await this.clearSnippets(files);
        await this.writeFiles(filesToWrite);
        this.logger.info("Snippets have been cleared.");
      }

      async getRepos() {
        const repositories = [];
        await Promise.all(
          this.origins.map(async ({ owner, repo, ref }) => {
            const repository = new Repo(owner, repo, ref);
            const dlProgress = new progress.Bar(
              {
                format: fmtProgressBar(`downloading repo ${join(owner, repo)}`),
                barsize: 20,
              },
              progress.Presets.shades_classic
            );
            dlProgress.start(3, 0);
            const byteArray = await this.getArchive(owner, repo, ref);
            dlProgress.increment();
            const fileName = `${repo}.zip`;
            const buffer = arrayBuffToBuff(byteArray);
            await writeAsync(fileName, buffer);
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
          owner,
          repo,
          ref,
          archive_format: "zipball",
        });
        return result.data;
      }

  async extractSnippets(repositories) {
    const snippets = [];
    await Promise.all(
      repositories.map(async ({ owner, repo, ref, filePaths }) => {
        const extractSnippetProgress = new progress.Bar(
          {
            format: fmtProgressBar(`extracting snippets from ${repo}`),
            barsize: 20,
          },
          progress.Presets.shades_classic
        );
        extractSnippetProgress.start(filePaths.length + 1, 0);
        const extractRootPath = join(rootDir, extractionDir);
        for (const item of filePaths) {
          extractSnippetProgress.increment();
          const ext = determineExtension(item.name);
          let path = join(item.directory, item.name);
          path = join(extractRootPath, path);
          let capture = false;
          let fileSnipsCount = 0;
          const fileSnips = [];
          await eachLineAsync(path, (line: string) => {
            if (line.includes(readEnd)) {
              capture = false;
              fileSnipsCount++;
            }
            if (capture) {
              fileSnips[fileSnipsCount].lines.push(line);
            }
            if (line.includes(readStart)) {
              capture = true;
              const id = extractID(line).trim();
              const snip = new Snippet(id, ext, owner, repo, ref, item);
              fileSnips.push(snip);
            }
          });
          snippets.push(...fileSnips);
        }
        extractSnippetProgress.increment();
        extractSnippetProgress.stop();
      })
    );
    for (const snippet of snippets) {
      snippet.fmt(this.config.features.enable_source_link);
    }
    return snippets;
  }

  async getTargetFilePaths() {
    const writeDir = join(rootDir, this.config.target);
    const insertPathProgress = new progress.Bar(
      {
        format: fmtProgressBar("loading target file paths from " + writeDir),
        barsize: 20,
      },
      progress.Presets.shades_classic
    );
    insertPathProgress.start(1, 0);
    const insertFilePaths = [];
    for await (const entry of readdirp(writeDir)) {
      const { path } = entry;
      insertFilePaths.push({ path });
      insertPathProgress.setTotal(insertFilePaths.length);
      insertPathProgress.increment();
    }
    insertPathProgress.stop();
    return insertFilePaths;
  }

  async getTargetFiles(filePaths) {
    const getInsertFilesProgress = new progress.Bar(
      {
        format: fmtProgressBar("loading file lines for each insert file"),
        barsize: 20,
      },
      progress.Presets.shades_classic
    );
    getInsertFilesProgress.start(filePaths.length, 0);
    const files = [];
    for (const filePath of filePaths) {
      files.push(await this.getTargetFileLines(filePath.path));
      getInsertFilesProgress.increment();
    }
    getInsertFilesProgress.stop();
    return files;
  }

  async getTargetFileLines(filename) {
    const insertRootPath = join(rootDir, this.config.target);
    const path = join(insertRootPath, filename);
    const file = new File(filename);
    const fileLines = [];
    await eachLineAsync(path, (line) => {
      fileLines.push(line);
    });
    file.lines = fileLines;
    return file;
  }

  async spliceSnippets(snippets, files) {
    const spliceProgress = new progress.Bar(
      {
        format: fmtProgressBar("starting splice operations"),
        barsize: 20,
      },
      progress.Presets.shades_classic
    );
    spliceProgress.start(snippets.length, 0);
    for (const snippet of snippets) {
      spliceProgress.increment();
      for (let file of files) {
        file = await this.getSplicedFile(snippet, file);
      }
    }
    spliceProgress.stop();
    return files;
  }
  async getSplicedFile(snippet, file) {
    const staticFile = file;
    let dynamicFile = file;
    let fileLineNumber = 1;
    let lookForStop = false;
    let spliceStart = 0;
    for (let [idx, _] of staticFile.lines.entries()) {
      const line = file.lines[idx];
      if (line.includes(writeStart)) {
        const id = insertID(line);
        if (id === snippet.id) {
          spliceStart = fileLineNumber;
          lookForStop = true;
        }
      }
      if (line.includes(writeEnd) && lookForStop) {
        dynamicFile = await this.spliceFile(
          spliceStart,
          fileLineNumber,
          snippet,
          dynamicFile
        );
        lookForStop = false;
      }
      fileLineNumber++;
    }
    return dynamicFile;
  }

  async spliceFile(start, end, snippet, file) {
    const rmlines = end - start;
    file.lines.splice(start, rmlines - 1, ...snippet.lines);
    return file;
  }

  async clearSnippets(files) {
    const clearProgress = new progress.Bar(
      {
        format: fmtProgressBar("starting clear operations"),
        barsize: 20,
      },
      progress.Presets.shades_classic
    );
    clearProgress.start(files.length, 0);
    for (let file of files) {
      file = await this.getClearedFile(file);
      clearProgress.increment();
    }
    clearProgress.stop();
    return files;
  }

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

  async writeFiles(files) {
    const insertRootPath = join(rootDir, this.config.target);
    const writeFileProgress = new progress.Bar(
      {
        format: fmtProgressBar("writing files to " + insertRootPath),
        barsize: 20,
      },
      progress.Presets.shades_classic
    );
    writeFileProgress.start(files.length, 0);
    for (const file of files) {
      const fileString = `${file.lines.join("\n")}\n`;
      const writePath = join(insertRootPath, file.filename);
      await writeAsync(writePath, fileString);
      writeFileProgress.increment();
    }
    writeFileProgress.stop();
    return;
  }

  async cleanUp() {
    const cleanupProgress = new progress.Bar(
      {
        format: fmtProgressBar("cleaning up downloads"),
        barsize: 20,
      },
      progress.Presets.shades_classic
    );
    cleanupProgress.start(1, 0);
    const path = join(rootDir, extractionDir);
    rimrafAsync(path);
    cleanupProgress.update(1);
    cleanupProgress.stop();
  }
}

function determineExtension(path) {
    const parts = path.split(".");
    return parts[parts.length - 1];
}

function extractID(line) {
    const parts = line.split(' ');
    return parts[2];
}

function insertID(line) {
    const parts = line.split(" ");
    const part = parts[parts.length - 1];
    return part.replace("-->", "");
}

import { fmtStartCodeBlock, markdownCodeTicks } from '../common';

  interface FilePath {
    name: string;
    directory: any;
    saved: boolean;
  }
  
  export default class Snippet {
    id: string;
    ext: string;
    owner: string;
    repo: string;
    ref: string;
    filePath: FilePath;
    lines: string[];
    constructor (id: string, ext: string, owner: string, repo: string, ref: string, filePath: FilePath) {
      this.id = id;
      this.ext = ext;
      this.owner = owner;
      this.repo = repo;
      this.ref = ref;
      this.filePath = filePath;
      this.lines = [];
    }
  
    fmt(fmtSourceLink: string) {
      this.lines.splice(0, 0, fmtStartCodeBlock(this.ext));
      this.lines.splice(this.lines.length, 0, markdownCodeTicks);
      if(fmtSourceLink) {
        this.lines.splice(0, 0, this.fmtSourceLink());
      }
    }
  
    fmtSourceLink() {
      const url: string = this.buildURL();
      const path: string = this.buildPath();
      let link: string = `[${path}](${url})`;
      return link;
    }
  
    buildPath() {
      let sourceURLParts: string = this.filePath.directory.split('/');
      let path: string = [
        ...(sourceURLParts.slice(1, sourceURLParts.length)),
        this.filePath.name
      ].join('/');
      return path;
    }
  
    buildURL() {
      let sourceURLParts: string[] = this.filePath.directory.split('/');
      let ref: string = ""
      if (this.ref != "" && this.ref != undefined) {
        ref = this.ref;
      } else {
        ref = "master";
      }
      const url: string = [
        'https://github.com',
        this.owner,
        this.repo,
        "blob",
        ref,
        ...(sourceURLParts.slice(1, sourceURLParts.length)),
        this.filePath.name
      ].join('/');
      return url
    }
  }
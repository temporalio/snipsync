const {
  fmtStartCodeBlock,
  markdownCodeTicks,
} = require('./common');

class Snippet {
  constructor (id, ext, owner, repo, ref, filePath) {
    this.id = id;
    this.ext = ext;
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.filePath = filePath;
    this.lines = [];
  }

  fmt(fmtSourceLink) {
    this.lines.splice(0, 0, fmtStartCodeBlock(this.ext));
    this.lines.splice(this.lines.length, 0, markdownCodeTicks);
    if(fmtSourceLink) {
      this.lines.splice(0, 0, this.fmtSourceLink());
    }
  }

  fmtSourceLink() {
    const url = this.buildURL();
    const path = this.buildPath();
    let link = `[${path}](${url})`;
    return link;
  }

  buildPath() {
    let sourceURLParts = this.filePath.directory.split('/');
    let path = [
      ...(sourceURLParts.slice(1, sourceURLParts.length)),
      this.filePath.name
    ].join('/');
    return path;
  }

  buildURL() {
    let sourceURLParts = this.filePath.directory.split('/');
    let ref = ""
    if (this.ref != "" && this.ref != undefined) {
      ref = this.ref;
    } else {
      ref = "master";
    }
    const url = [
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

module.exports = { Snippet };

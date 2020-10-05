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

  fmt() {
    this.lines.splice(0, 0, fmtStartCodeBlock(this.ext));
    this.lines.splice(this.lines.length, 0, markdownCodeTicks);
    this.lines.splice(this.lines.length, 0, this.fmtSourceLink());
  }

  fmtSourceLink() {

    let sourceURLParts = this.filePath.directory.split('/');
    let ref = ""
    if (this.ref != "" && this.ref != undefined) {
      ref = this.ref;
    } else {
      ref = "master";
    }
    const sourceURL = [
      'https://github.com',
      this.owner,
      this.repo,
      "blob",
      ref,
      ...(sourceURLParts.slice(1, sourceURLParts.length)),
      this.filePath.name
    ].join('/');
    let link = '[View source file](' + sourceURL + ')';
    return link;
  }
}

module.exports = { Snippet };

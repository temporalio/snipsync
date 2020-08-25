const common = require('./common.js');

class Snippet {
  constructor (id, ext) {
    this.id = id;
    this.ext = ext;
    this.lines = [];
  }

  fmt() {
    this.lines.splice(0, 0, common.fmtStartCodeBlock(this.ext));
    this.lines.splice(this.lines.length, 0, common.markdowncodeticks);
  }
}

module.exports.Snippet = Snippet;

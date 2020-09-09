const {
  fmtStartCodeBlock,
  markdownCodeTicks,
} = require('./common');

class Snippet {
  constructor (id, ext) {
    this.id = id;
    this.ext = ext;
    this.lines = [];
  }

  fmt() {
    this.lines.splice(0, 0, fmtStartCodeBlock(this.ext));
    this.lines.splice(this.lines.length, 0, markdownCodeTicks);
  }
}

module.exports = { Snippet };


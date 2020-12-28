export default class File {
    filename: string;
    lines: string[];
    constructor(filename: string) {
      this.filename = filename;
      this.lines = [];
    }
  }
  
  
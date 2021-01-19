
export default class Repo {
    owner: string;
    repo: string;
    ref: string;
    filePaths: string[];
    constructor(owner: string, repo: string, ref: string) {
      this.owner = owner;
      this.repo = repo;
      this.ref = ref;
      this.filePaths = [];
    }
  }

class Repo {
  constructor(owner, repo, ref) {
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.filePaths = [];
  }
}

module.exports = { Repo };

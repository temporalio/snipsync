module.exports = {
  rootDir: process.cwd(),
  cfgFile: 'snipsync.config.yaml',
  extractionDir: 'sync_repos',
  markdownCodeTicks: '```',
  fmtStartCodeBlock: (ext) => '```' + ext,
  readStart: '@@@SNIPSTART',
  readEnd: '@@@SNIPEND',
  writeStart: '<!--SNIPSTART',
  writeStartClose: '-->',
  writeEnd: '<!--SNIPEND',
  writeEndClose: '-->',
  fmtProgressBar: (message) => `⭐ + | {bar} | {percentage}% | {value}/{total} chunks | ${message}`,
};

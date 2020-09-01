module.exports = {
  rootDir: process.cwd(),
  cfgFile: "snipsync_config.yml",
  extractionDir: "sync_repos",
  markdownCodeTicks: "```",
  fmtStartCodeBlock: (ext) => "```" + ext,
  readStart: "@@@START",
  readEnd: "@@@END",
  writeStart: "<!--START",
  writeEnd: "<!--END",
  fmtProgressBar: (message) => "⭐ " + "| {bar} | {percentage}% | {value}/{total} chunks | " + message
}

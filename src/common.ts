
export const rootDir = process.cwd();
export const cfgFile = 'snipsync.config.yaml';
export const extractionDir = 'sync_repos';
export const markdownCodeTicks = '```';
export const fmtStartCodeBlock = (ext: string) => '```' + ext;
export const readStart = '@@@SNIPSTART';
export const readEnd = '@@@SNIPEND';
export const writeStart = '<!--SNIPSTART';
export const writeEnd = '<!--SNIPEND';
export const fmtProgressBar = (message: string) => `⭐ + | {bar} | {percentage}% | {value}/{total} chunks | ${message}`;

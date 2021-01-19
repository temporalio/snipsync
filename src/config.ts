  
import { join } from 'path';
import { sync } from 'node-read-yaml';
import { cfgFile, rootDir, fmtProgressBar } from './common';
import progress from 'cli-progress';

export const readConfig = () => {
  const cfgPath = join(rootDir, cfgFile);
  const cfgProgress = new progress.Bar({
    format: fmtProgressBar(`loading configuration from ${cfgPath}`),
    barsize: 20,
  }, progress.Presets.shades_classic);
  cfgProgress.start(1, 0);
  const cfg = sync(cfgPath);

  cfgProgress.update(1);
  cfgProgress.stop();
  return cfg;
};

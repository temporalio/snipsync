import logger from 'js-logger';
import { readConfig } from './src/config';
import Sync from './src/Sync';

logger.useDefaults();
const args = process.argv.slice(2);
const cfg = readConfig();
const synctron = new Sync(cfg, logger);

switch (args[0]) {
  case '--clear':
    synctron.clear();
    break;
  default:
    synctron.run();
}

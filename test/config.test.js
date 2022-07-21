const logger = require('js-logger');
const { readConfig } = require('../src/config');
logger.setLevel(logger.WARN);

test('Sets origin and targets', async() => {
  const configFile = 'test/fixtures/docsync-config-min.yaml';
  const cfg = readConfig(logger, configFile);
  expect(cfg.origins).toEqual([{ owner: 'temporalio', repo: 'samples-typescript' }]);
  expect(cfg.targets).toEqual(['test/workspace']);
});

test('Sets enable_source_link to true when not defined', async() => {
  const configFile = 'test/fixtures/docsync-config-min.yaml';
  const cfg = readConfig(logger, configFile);
  expect(cfg.features.enable_source_link).toBe(true);
});


test('Sets enable_code_block to true when not defined', async() => {
  const configFile = 'test/fixtures/docsync-config-min.yaml';
  const cfg = readConfig(logger, configFile);
  expect(cfg.features.enable_code_block).toBe(true);
});

test('Sets allowed_target_extensions to empty array when not defined', async() => {
  const configFile = 'test/fixtures/docsync-config-min.yaml';
  const cfg = readConfig(logger, configFile);
  expect(cfg.features.allowed_target_extensions).toEqual([]);
});

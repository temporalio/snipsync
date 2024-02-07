const logger = require('js-logger');
const { Sync } = require('../src/Sync');
const fs = require('fs');

const fixturesPath = 'test/fixtures';
const testEnvPath = 'test/.tmp';

let cfg = {};

logger.setLevel(logger.WARN);

beforeEach(() => {
  // Default config with all options filled in.
  // Redefine keys as needed for tests.
  cfg = {
    origins: [
      { owner: 'temporalio', repo: 'samples-typescript' },
      { owner: 'temporalio', repo: 'email-subscription-project-python'},
      { owner: 'temporalio', repo: 'money-transfer-project-template-go'},
    ],
    targets: [ testEnvPath ],
    features: {
      enable_source_link: true,
      enable_code_block: true,
      allowed_target_extensions: [],
    },
  };

  fs.mkdirSync(testEnvPath, { recursive: true });
  fs.copyFileSync(`${fixturesPath}/index.md`,`${testEnvPath}/index.md`);
  fs.copyFileSync(`${fixturesPath}/index.txt`,`${testEnvPath}/index.txt`);
});


afterEach(() => {
   fs.rmSync(testEnvPath, { recursive: true });
});

test('Pulls snippet text into a file', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/index.md`, 'utf8');

  expect(data).toMatch(/export async function greet/);

});

test('Does not render code fences when option for code block is false', async() => {

  cfg.features.enable_code_block = false;
  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/index.md`, 'utf8');

  expect(data).not.toMatch(/```ts/);

});

test('Puts source link in the code', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/index.md`, 'utf8');

  expect(data).toMatch(/\[hello-world\/src\/activities.ts\]/);

});

test('Does not put source link in the code when option is false', async() => {
  cfg.features.enable_source_link = false;

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/index.md`, 'utf8');

  expect(data).not.toMatch(/\[hello-world\/src\/activities.ts\]/);

});

test('Changes all files when allowed_target_extensions is not set', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();

  let data = fs.readFileSync(`${testEnvPath}/index.md`, 'utf8');
  expect(data).toMatch(/export async function greet/);

  data = fs.readFileSync(`${testEnvPath}/index.txt`, 'utf8');
  expect(data).toMatch(/export async function greet/);
});

test('Changes only markdown files when allowed_target_extensions is set to .md', async() => {
  cfg.features.allowed_target_extensions = ['.md'];

  const synctron = new Sync(cfg, logger);
  await synctron.run();

  let data = fs.readFileSync(`${testEnvPath}/index.md`, 'utf8');
  expect(data).toMatch(/export async function greet/);

  data = fs.readFileSync(`${testEnvPath}/index.txt`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);

});

test('Cleans snippets from files that were not cleaned up previously', async() => {
  fs.copyFileSync(`${fixturesPath}/index_with_code.md`,`${testEnvPath}/index_with_code.md`);

  let data = fs.readFileSync(`${testEnvPath}/index_with_code.md`, 'utf8');
  expect(data).toMatch(/export async function greet/);

  const synctron = new Sync(cfg, logger);
  await synctron.clear();

  data = fs.readFileSync(`${testEnvPath}/index_with_code.md`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);
});

test('Cleans snippets from all files', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  await synctron.clear();

  fs.copyFileSync(`${fixturesPath}/index.txt`,`${testEnvPath}/index.txt`);

  let data = fs.readFileSync(`${testEnvPath}/index.md`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);

  data = fs.readFileSync(`${testEnvPath}/index.txt`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);
});

test('uses regex patterns to pare down snippet inserted into a file', async() => {

  cfg.origins = [
      { owner: 'temporalio', repo: 'money-transfer-project-template-go' },
      { owner: 'temporalio', repo: 'samples-typescript' },
    ],

  fs.copyFileSync(`${fixturesPath}/regex_index.md`,`${testEnvPath}/regex_index.md`);

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/regex_index.md`, 'utf8');

  // check go snippet
  expect(data).not.toMatch(/func MoneyTransfer/);
  expect(data).toMatch(/retrypolicy := &temporal\.RetryPolicy\{/);
  expect(data).not.toMatch(/options := workflow.ActivityOptions/);


  // check js snippet
  expect(data).not.toMatch(/import type \* as activities/);
  expect(data).toMatch(/const \{ greet/);
  expect(data).not.toMatch(/export async function example/);
  
});

test('Do not dedent snippets when option is false', async() => {

  fs.copyFileSync(`${fixturesPath}/dedent.md`,`${testEnvPath}/dedent.md`);

  cfg.origins = [
    { owner: 'temporalio', repo: 'samples-typescript' },
  ];

  cfg.features.enable_code_dedenting = false;

  const synctron = new Sync(cfg, logger);
  await synctron.run();

  let data = fs.readFileSync(`${testEnvPath}/dedent.md`, 'utf8');
  data = data.split("\n");

  /*
   * The code will start on the 4th line, as the 1st is the comment, second is the file link
   * and the third is the code fence.
   * The fourth line should have two spaces on the first line, as they should not be stripped.
   */
  expect(data[3]).toMatch(/^\s\s/);

});

test('Dedent snippets when option is set', async() => {

  fs.copyFileSync(`${fixturesPath}/dedent.md`,`${testEnvPath}/dedent.md`);

  cfg.origins = [
    { owner: 'temporalio', repo: 'samples-typescript' },
  ];

  cfg.features.enable_code_dedenting = true;

  const synctron = new Sync(cfg, logger);
  await synctron.run();

  let data = fs.readFileSync(`${testEnvPath}/dedent.md`, 'utf8');
  data = data.split("\n");

  /*
   * The code will start on the 4th line, as the 1st is the comment, second is the file link
   * and the third is the code fence.
   * The fourth line should NOT have two spaces at the start of the line, as they should be stripped.
   */
  expect(data[3]).not.toMatch(/^\s/);

});

test('Per snippet selectedLines configuration', async() => {

  cfg.origins = [
      { owner: 'temporalio', repo: 'money-transfer-project-template-go' },
    ],

  fs.copyFileSync(`${fixturesPath}/empty-select.md`,`${testEnvPath}/empty-select.md`);

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/empty-select.md`, 'utf8');
  const expected = fs.readFileSync(`test/fixtures/expected-select.md`, 'utf8');
  expect(data).toMatch(expected);

});

test('Per snippet highlightedLines configuration', async() => {

  cfg.origins = [
      { owner: 'temporalio', repo: 'money-transfer-project-template-go' },
    ],

  fs.copyFileSync(`${fixturesPath}/empty-highlight.md`,`${testEnvPath}/empty-highlight.md`);

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/empty-highlight.md`, 'utf8');
  const expected = fs.readFileSync(`test/fixtures/expected-highlight.md`, 'utf8');
  expect(data).toMatch(expected);

});

test('Local file ingestion', async() => {

  cfg.origins = [
      {
        files: {
          pattern: "./test/fixtures/*.go",
          owner: "temporal",
          repo: "snipsync",
          ref: "main",
        }
      },
    ],

  fs.copyFileSync(`${fixturesPath}/empty-test-local-files.md`,`${testEnvPath}/empty-test-local-files.md`);

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${testEnvPath}/empty-test-local-files.md`, 'utf8');
  const expected = fs.readFileSync(`test/fixtures/expected-test-local-files.md`, 'utf8');
  expect(data).toMatch(expected);

});

const logger = require('js-logger');
const { Sync } = require('../src/Sync');
const fs = require('fs');

const fixturesPath = 'test/fixtures/tutorials';
const tutorialsPath = 'test/.tmp';

let cfg = {};

logger.setLevel(logger.WARN);

beforeEach(() => {
  // Default config with all options filled in.
  // Redefine keys as needed for tests.
  cfg = {
    origins: [
      { owner: 'temporalio', repo: 'samples-typescript' },
    ],
    targets: [ tutorialsPath ],
    features: {
      enable_source_link: true,
      enable_code_block: true,
      allowed_target_extensions: [],
      enable_code_dedenting: true,
    },
  };

  fs.mkdirSync(tutorialsPath, { recursive: true });
  fs.copyFileSync(`${fixturesPath}/index.md`,`${tutorialsPath}/index.md`);
  fs.copyFileSync(`${fixturesPath}/index.txt`,`${tutorialsPath}/index.txt`);
});


afterAll(() => {
 fs.rmSync(tutorialsPath, { recursive: true });
});

test('Pulls snippet text into a file', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${tutorialsPath}/index.md`, 'utf8');

  fs.copyFileSync(`${tutorialsPath}/index.md`,`${fixturesPath}/index_with_code.md`);
  expect(data).toMatch(/export async function greet/);

});

test('Does not render code fences when option for code block is false', async() => {

  cfg.features.enable_code_block = false;
  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${tutorialsPath}/index.md`, 'utf8');

  expect(data).not.toMatch(/```ts/);

});

test('Puts source link in the code', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${tutorialsPath}/index.md`, 'utf8');

  expect(data).toMatch(/\[hello-world\/src\/activities.ts\]/);

});

test('Does not put source link in the code when option is false', async() => {
  cfg.features.enable_source_link = false;

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  const data = fs.readFileSync(`${tutorialsPath}/index.md`, 'utf8');

  expect(data).not.toMatch(/\[hello-world\/src\/activities.ts\]/);

});

test('Changes all files when allowed_target_extensions is not set', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();

  let data = fs.readFileSync(`${tutorialsPath}/index.md`, 'utf8');
  expect(data).toMatch(/export async function greet/);

  data = fs.readFileSync(`${tutorialsPath}/index.txt`, 'utf8');
  expect(data).toMatch(/export async function greet/);
});

test('Changes only markdown files when allowed_target_extensions is set to .md', async() => {
  cfg.features.allowed_target_extensions = ['.md'];

  const synctron = new Sync(cfg, logger);
  await synctron.run();

  let data = fs.readFileSync(`${tutorialsPath}/index.md`, 'utf8');
  expect(data).toMatch(/export async function greet/);

  data = fs.readFileSync(`${tutorialsPath}/index.txt`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);

});

test('Cleans snippets from files that were not cleaned up previously', async() => {
  fs.copyFileSync(`${fixturesPath}/index_with_code.md`,`${tutorialsPath}/index_with_code.md`);

  let data = fs.readFileSync(`${tutorialsPath}/index_with_code.md`, 'utf8');
  expect(data).toMatch(/export async function greet/);

  const synctron = new Sync(cfg, logger);
  await synctron.clear();

  data = fs.readFileSync(`${tutorialsPath}/index_with_code.md`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);
});

test('Cleans snippets from all files', async() => {

  const synctron = new Sync(cfg, logger);
  await synctron.run();
  await synctron.clear();

  fs.copyFileSync(`${fixturesPath}/index.txt`,`${tutorialsPath}/index.txt`);

  let data = fs.readFileSync(`${tutorialsPath}/index.md`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);

  data = fs.readFileSync(`${tutorialsPath}/index.txt`, 'utf8');
  expect(data).not.toMatch(/export async function greet/);
});


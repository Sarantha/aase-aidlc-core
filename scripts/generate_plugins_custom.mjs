import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR_DIR = join(REPO_ROOT, 'src', 'rosettify-plugins');
const HOOKS_DIR = join(REPO_ROOT, 'src', 'hooks');
const OUTPUT_DIR = join(REPO_ROOT, 'plugins-custom');
const IS_WINDOWS = process.platform === 'win32';

const TARGETS = {
  claude: 'core-claude',
  copilot: 'core-copilot',
  'copilot-standalone': 'core-copilot-standalone',
  cursor: 'core-cursor',
  'cursor-standalone': 'core-cursor-standalone',
  codex: 'core-codex',
  antigravity: 'core-antigravity',
};

const VARIANTS = {
  full: [null],
  light: ['lightweight'],
  both: [null, 'lightweight'],
};

function printHelp() {
  console.log(`Generate selected Rosetta plugins into ${OUTPUT_DIR}

Usage: node scripts/generate_plugins_custom.mjs -setup
       node scripts/generate_plugins_custom.mjs <targets...> [variant] [options]

Setup (run once after cloning, and after pulling dependency changes):
  -setup                 npm install in src/hooks and src/rosettify-plugins,
                         then build the hooks; generates nothing on its own

Targets (pick one or more):
${Object.entries(TARGETS).map(([flag, name]) => `  -${flag.padEnd(20)} ${name}`).join('\n')}
  -all                   every target above

Variant (default: full):
  -light                 only the lightweight build (e.g. core-claude-light)
  -both                  full and lightweight builds

Options:
  -verbose               show the generator's log output
  -help                  show this help`);
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const targets = new Set();
  let variant = 'full';
  let verbose = false;
  let setup = false;

  for (const raw of argv) {
    const arg = raw.replace(/^-+/, '').toLowerCase();
    if (arg === 'help' || arg === 'h') {
      printHelp();
      process.exit(0);
    } else if (arg === 'setup') {
      setup = true;
    } else if (arg === 'all') {
      Object.keys(TARGETS).forEach((t) => targets.add(t));
    } else if (arg in TARGETS) {
      targets.add(arg);
    } else if (arg === 'light' || arg === 'both') {
      variant = arg;
    } else if (arg === 'verbose') {
      verbose = true;
    } else {
      fail(`unknown option "${raw}". Run with -help to see the options.`);
    }
  }

  if (targets.size === 0 && !setup) {
    printHelp();
    fail('no target selected.');
  }
  return { targets: [...targets], variant, verbose, setup };
}

function run(command, args, { cwd, verbose, shell = false }) {
  const result = spawnSync(command, args, {
    cwd,
    shell,
    encoding: 'utf8',
    stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) fail(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    if (!verbose) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    fail(`${[command, ...args].join(' ')} exited with code ${result.status}`);
  }
}

function npm(args, cwd, verbose) {
  if (IS_WINDOWS) run(['npm', ...args].join(' '), [], { cwd, verbose, shell: true });
  else run('npm', args, { cwd, verbose });
}

function findGitBash() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ];
  return candidates.find((p) => existsSync(p));
}

function installGenerator(verbose) {
  console.log('Installing generator dependencies (src/rosettify-plugins)...');
  npm(['install', '--no-audit', '--no-fund'], GENERATOR_DIR, verbose);
}

function installHooks(verbose) {
  console.log('Installing hooks dependencies (src/hooks)...');
  npm(['install', '--no-audit', '--no-fund'], HOOKS_DIR, verbose);
}

// The hooks build uses rm/mkdir/cp, so on Windows it needs Git Bash, not cmd or WSL.
function buildHooks(verbose) {
  console.log('Building hooks...');
  const buildArgs = ['run', 'build:quiet'];
  if (IS_WINDOWS) {
    const gitBash = findGitBash();
    if (!gitBash) fail('Git Bash not found. Install Git for Windows to build the hooks.');
    buildArgs.push('--script-shell', `"${gitBash}"`);
  }
  npm(buildArgs, HOOKS_DIR, verbose);
}

// -setup: always reinstall and rebuild, so it also picks up dependency or hook changes.
function setupAll(verbose) {
  installHooks(verbose);
  installGenerator(verbose);
  buildHooks(verbose);
  console.log('Setup complete.');
}

// Generation without -setup: only fill in what is missing (e.g. -setup was never run).
function ensureDependencies(verbose) {
  if (!existsSync(join(GENERATOR_DIR, 'node_modules', 'tsx'))) installGenerator(verbose);
  if (!existsSync(join(HOOKS_DIR, 'dist', 'bundles'))) {
    if (!existsSync(join(HOOKS_DIR, 'node_modules'))) installHooks(verbose);
    buildHooks(verbose);
  }
}

function generateInto(tempDir, profile, verbose) {
  const tsxCli = join(GENERATOR_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const args = [
    tsxCli, join(GENERATOR_DIR, 'src', 'cli.ts'),
    '--source', REPO_ROOT,
    '--release', 'r3',
    '--deterministic-hooks', 'false',
    '--output', tempDir,
  ];
  if (profile) args.push('--profile', profile);
  console.log(`Generating ${profile ? `${profile} ` : ''}plugins...`);
  run(process.execPath, args, { cwd: GENERATOR_DIR, verbose });
}

function main() {
  const { targets, variant, verbose, setup } = parseArgs(process.argv.slice(2));
  const profiles = VARIANTS[variant];

  if (setup) {
    setupAll(verbose);
    if (targets.length === 0) return;
  } else {
    ensureDependencies(verbose);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'rosetta-plugins-'));
  try {
    profiles.forEach((profile) => generateInto(tempDir, profile, verbose));

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const created = [];
    for (const target of targets) {
      for (const profile of profiles) {
        const name = TARGETS[target] + (profile ? '-light' : '');
        const source = join(tempDir, name);
        if (!existsSync(source)) fail(`generator did not produce ${name}`);
        const destination = join(OUTPUT_DIR, name);
        rmSync(destination, { recursive: true, force: true });
        cpSync(source, destination, { recursive: true });
        created.push(name);
      }
    }

    console.log(`\nCreated in ${OUTPUT_DIR}:`);
    created.forEach((name) => console.log(`  ${name}`));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
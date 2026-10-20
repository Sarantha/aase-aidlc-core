# Rosetta plugin generator

This repository builds the Rosetta AI-assistant plugins (GitHub Copilot, Claude Code, Cursor, Codex, Antigravity) from one set of instruction sources. It is a trimmed fork of [griddynamics/rosetta](https://github.com/griddynamics/rosetta) that keeps only what plugin generation needs.

## Layout

| Path | Purpose |
| --- | --- |
| `instructions/r3/core/` | Source of truth: agents, skills, rules, workflows, templates |
| `src/rosettify-plugins/` | The generator (`rosettify-plugins` CLI) and per-plugin preserved files (`plugins/`) and build profiles (`profiles/`) |
| `src/hooks/` | Hook scripts, bundled per IDE into `src/hooks/dist/` |
| `plugins/` | Generated plugins, committed so marketplaces can install them from GitHub |
| `.github/plugin/`, `.claude-plugin/`, `.cursor-plugin/`, `.agents/plugins/` | Marketplace manifests that point at `plugins/` |
| `scripts/generate_plugins_custom.mjs` | Builds only the plugins you pick, into `plugins-custom/` |

## Requirements

- Node.js 22 or later
- Windows: Git for Windows (Git Bash), because the hooks build uses `rm`, `mkdir` and `cp`

## Build selected plugins

1. Set up once after cloning (and again after pulling dependency or hook changes). This runs `npm install` in `src/hooks` and `src/rosettify-plugins`, then builds the hooks:

   ```sh
   node scripts/generate_plugins_custom.mjs -setup
   ```

2. Generate the plugins you need. They are written to `plugins-custom/` (git-ignored):

   ```sh
   node scripts/generate_plugins_custom.mjs -claude
   node scripts/generate_plugins_custom.mjs -copilot -cursor -both
   node scripts/generate_plugins_custom.mjs -all -light
   node scripts/generate_plugins_custom.mjs -help
   ```

## Regenerate `plugins/`

Run after changing anything in `instructions/`, `src/rosettify-plugins/` or `src/hooks/`, then commit the result.

```sh
cd src/hooks && npm install && npm run build:quiet && cd ../..
# On Windows PowerShell: npm run build:quiet --script-shell "C:\Program Files\Git\bin\bash.exe"

cd src/rosettify-plugins && npm install && cd ../..
npx --prefix src/rosettify-plugins tsx src/rosettify-plugins/src/cli.ts --source . --release r3 --deterministic-hooks false
npx --prefix src/rosettify-plugins tsx src/rosettify-plugins/src/cli.ts --source . --release r3 --deterministic-hooks false --profile lightweight
```

## Where to make changes

- Agent, skill, rule and workflow content: `instructions/r3/core/`
- Plugin name, author, version and hook templates: `src/rosettify-plugins/plugins/<target>/`
- Marketplace names and listings: the four marketplace manifests above

## License

Apache-2.0. See `LICENSE` and `NOTICE`.

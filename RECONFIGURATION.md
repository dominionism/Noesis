# Noesis Reconfiguration Guide

This guide restores the Noesis mechanism on a freshly reset Mac.

Scope:

- Restores the Noesis codebase and workflow mechanism
- Recreates a fresh `~/.agents` home
- Reinstates the shell wrappers that auto-inject Noesis context into `codex`, `claude`, `opencode`, and `kilocode`
- Restores prior memories if you import the repo-backed export file in `backups/noesis-memory-export.json`

Important:

- This repo now contains a committed Noesis memory export at `backups/noesis-memory-export.json`
- If you want those memories to remain private, keep the repository private

## 1. Install Machine Prerequisites

Install Xcode Command Line Tools if they are not already installed:

```bash
xcode-select --install
```

Install Homebrew if needed, then install the core tools:

```bash
brew install git
brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
hash -r
```

Verify that Node resolves to `24.x`:

```bash
node -v
which node
```

If `node -v` is not `v24.x`, fix that before continuing.

If `node@24` is unavailable in Homebrew on your future machine, use any version manager you prefer, but do not continue until `node -v` resolves to `v24.x`.

## 2. Clone Noesis Back To The Expected Path

Your current shell integration expects Noesis to live at:

```bash
/Users/dominion/noesis
```

Clone it back there:

```bash
cd /Users/dominion
git clone https://github.com/dominionism/Noesis.git noesis
cd /Users/dominion/noesis
```

If you choose a different path, you must update all hardcoded Noesis paths in your shell config later in this guide.

## 3. Install Dependencies And Build

From the repo root:

```bash
cd /Users/dominion/noesis
npm install
npm run build
```

This should produce the compiled CLI and daemon under `dist/`.

## 4. Initialize A Fresh Noesis Home

Run the CLI directly from the local checkout:

```bash
node /Users/dominion/noesis/dist/cli/index.js init
node /Users/dominion/noesis/dist/cli/index.js quickstart
```

This creates a fresh `~/.agents` home with the Noesis database, config, signing key, models directory, hooks directory, and other runtime state.

## 5. Import The Backed-Up Memories

The repo includes a committed Noesis export here:

```bash
/Users/dominion/noesis/backups/noesis-memory-export.json
```

Import it into the fresh local Noesis database:

```bash
node /Users/dominion/noesis/dist/cli/index.js import /Users/dominion/noesis/backups/noesis-memory-export.json
```

After import, verify:

```bash
node /Users/dominion/noesis/dist/cli/index.js recall "Noesis"
```

If you intentionally want a fresh memory state, skip this section.

## 6. Restore The Shell Integration

Open your `~/.zshrc`:

```bash
nano ~/.zshrc
```

Append this block exactly:

```zsh
export PATH="/opt/homebrew/bin:$PATH"
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"

# Prefer the local Noesis checkout in interactive shells.
noesis() { node /Users/dominion/noesis/dist/cli/index.js "$@"; }

# Auto-inject Noesis context before launching AI coding agents
_noesis_inject() {
  if /Users/dominion/noesis/scripts/noesis-inject 2>/tmp/noesis-inject.err || noesis-inject 2>/tmp/noesis-inject.err; then
    return 0
  else
    echo "[noesis] Context injection failed. Check /tmp/noesis-inject.err" >&2
    return 1
  fi
}

_noesis_project_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

_noesis_runtime_bridge_setup() {
  local instruction_file="$1"
  local project_root context_file bridge_path

  project_root=$(_noesis_project_root) || return 0
  context_file="$project_root/Context/$instruction_file"
  bridge_path="$project_root/$instruction_file"

  if [[ ! -e "$context_file" && ! -L "$context_file" ]]; then
    return 0
  fi

  if [[ -e "$bridge_path" || -L "$bridge_path" ]]; then
    return 0
  fi

  (
    cd "$project_root" || exit 1
    ln -s "Context/$instruction_file" "$instruction_file"
  ) || return 0

  printf '%s\n' "$bridge_path"
}

_noesis_runtime_bridge_cleanup() {
  local bridge_path="$1"
  local instruction_file target

  [[ -n "$bridge_path" ]] || return 0
  [[ -L "$bridge_path" ]] || return 0

  instruction_file="${bridge_path##*/}"
  target=$(readlink "$bridge_path" 2>/dev/null || true)

  if [[ "$target" == "Context/$instruction_file" ]]; then
    rm -f "$bridge_path"
  fi
}

_noesis_with_bridge() {
  local instruction_file="$1"
  shift

  _noesis_inject || return 1

  local bridge_path=""
  bridge_path=$(_noesis_runtime_bridge_setup "$instruction_file")

  command "$@"
  local exit_code=$?

  _noesis_runtime_bridge_cleanup "$bridge_path"
  return $exit_code
}

opencode() { _noesis_with_bridge AGENTS.md opencode "$@"; }
codex() { _noesis_with_bridge AGENTS.md codex "$@"; }
claude() { _noesis_with_bridge CLAUDE.md claude "$@"; }
kilocode() { _noesis_with_bridge AGENTS.md kilocode "$@"; }
```

If your Noesis repo lives somewhere other than `/Users/dominion/noesis`, replace that path in:

- `noesis()`
- `_noesis_inject()`

## 7. Reload The Shell

```bash
source ~/.zshrc
```

Then verify the shell sees the local Noesis wrapper:

```bash
which node
type noesis
```

## 8. Verify Noesis Is Working

Run these checks:

```bash
noesis status
noesis recall "test"
cd /Users/dominion/noesis
/Users/dominion/noesis/scripts/noesis-inject
```

Expected outcomes:

- `noesis status` returns health information
- `noesis recall "test"` runs successfully, even if it finds little or nothing in a fresh install
- `noesis-inject` completes without error

## 9. Reinstall Your Agent CLIs

Your wrapper functions assume these commands already exist on `PATH`:

- `codex`
- `claude`
- `opencode`
- `kilocode`

Reinstall whichever ones you actually use on the reset Mac. Noesis wraps those commands; it does not install them for you.

## 10. Quick End-To-End Check

In any git repo that has a `Context/AGENTS.md` or `Context/CLAUDE.md`, try launching an agent through the wrapper:

```bash
codex
```

or:

```bash
claude
```

The wrapper should:

- run Noesis injection first
- create a temporary top-level `AGENTS.md` or `CLAUDE.md` symlink if needed
- launch the agent
- remove the temporary bridge after the command exits

## 11. What You Will And Will Not Get Back

What this guide restores:

- the pushed Noesis codebase
- the CLI and daemon build
- the repo-backed exported memories, if you run the import step
- the shell-based Noesis workflow
- fresh Noesis runtime state under `~/.agents`

What this guide does not restore automatically:

- your previous database contents
- any old `~/.agents` custom state you did not separately back up

With the committed export file plus the import step above, your prior memories can also be restored into the fresh machine.

## 12. Minimal Recovery Command List

If you just want the shortest useful sequence:

```bash
xcode-select --install
brew install git
brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
hash -r
cd /Users/dominion
git clone https://github.com/dominionism/Noesis.git noesis
cd /Users/dominion/noesis
npm install
npm run build
node /Users/dominion/noesis/dist/cli/index.js init
node /Users/dominion/noesis/dist/cli/index.js quickstart
node /Users/dominion/noesis/dist/cli/index.js import /Users/dominion/noesis/backups/noesis-memory-export.json
source ~/.zshrc
noesis status
```

## 13. Recommended After Restore

Once everything is working, create a backup of your fresh setup so future recovery is faster:

```bash
noesis export
```

That gives you a structured Noesis backup in addition to the GitHub repo backup.

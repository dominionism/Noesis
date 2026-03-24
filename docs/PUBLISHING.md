# Publishing Noesis Safely

This repository is designed to be shareable without bundling local runtime
state. Before making a fork or copy public, verify the following:

## Keep Local State Out Of Git

- Do not commit `.env` files, local databases, socket files, audit logs, or signing keys.
- Keep project-local agent continuity under `.agents/sessions/` and the live
  `.agents/contexts/*.md` runtime files untracked.
- Confirm your local Git author uses a privacy-safe identity if you do not want
  your personal email exposed in commit history.

## Verify Content Hygiene

Run a quick scan from the repo root:

```bash
rg -n --hidden --glob '!.git' --glob '!.git/**' \
  '<your-username>|<your-email-domain>|<private-workflow-path>'
```

Review commit authors before changing visibility:

```bash
git log --format='%h %an <%ae> %ad %s' --date=short
```

## Keep Tooling Consistent

If your machine has multiple Node installations, ensure `node`, `npm`, `npx`,
and any linked `noesis` binary resolve to the same runtime before debugging
native-module or test-runner failures.

At minimum, confirm they agree before running tests:

```bash
command -v node
command -v npm
command -v npx
npx vitest run
```

## Release Notes

- Runtime state lives outside the repo by default under `~/.agents`.
- API keys should remain in environment variables, not committed config.
- The repository is intended for source-based use unless you explicitly prepare
  an npm distribution workflow.

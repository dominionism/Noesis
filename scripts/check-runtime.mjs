#!/usr/bin/env node

const REQUIRED_NODE_MAJOR = 24;
const PINNED_NODE_VERSION = '24.7.0';
const currentVersion = process.versions.node;
const [currentMajor] = currentVersion.split('.').map(Number);

if (currentMajor !== REQUIRED_NODE_MAJOR) {
  console.error(
    `Noesis requires Node ${REQUIRED_NODE_MAJOR}.x (validated with ${PINNED_NODE_VERSION}).`,
  );
  console.error(`Current Node: v${currentVersion}`);
  console.error(`Resolved node binary: ${process.execPath}`);
  console.error(
    'Load the pinned runtime from .nvmrc or .node-version before running npm install, lint, or test.',
  );
  process.exit(1);
}

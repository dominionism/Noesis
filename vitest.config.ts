import { defineConfig } from 'vitest/config';

const REQUIRED_NODE_MAJOR = 24;
const PINNED_NODE_VERSION = '24.7.0';
const [currentNodeMajor] = process.versions.node.split('.').map(Number);

if (currentNodeMajor !== REQUIRED_NODE_MAJOR) {
  throw new Error(
    `Noesis requires Node ${REQUIRED_NODE_MAJOR}.x (validated with ${PINNED_NODE_VERSION}). Current Node: v${process.versions.node}. Resolved node binary: ${process.execPath}. Load the pinned runtime from .nvmrc or .node-version before running Vitest.`,
  );
}

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    fileParallelism: false,
  },
});

/**
 * noesis init — First-time setup
 *
 * Creates the ~/.agents directory structure, generates a signing key,
 * creates the default configuration file, and initializes the database.
 * If already initialized, reports current status.
 *
 * This command operates directly on the filesystem and core modules
 * without going through the daemon.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync } from 'node:fs';

import {
  NOESIS_HOME,
  DB_PATH,
  SIGNING_KEY_PATH,
  CONFIG_PATH,
  MEMORY_DIR,
  SKILLS_DIR,
  ANTI_PATTERNS_DIR,
  COLD_STORAGE_DIR,
  BACKUPS_DIR,
  MODELS_DIR,
  FILE_PERMISSIONS,
} from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';
import { generateSigningKey, loadSigningKey } from '../../security/hmac.js';
import { loadConfig, saveConfig } from '../../config.js';
import { enforcePermissions } from '../../security/permissions.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize Noesis: create directories, signing key, config, and database')
    .action(async () => {
      const opts = program.opts();
      const verbose = opts.verbose === true;

      // Check if already initialized
      const alreadyInit = existsSync(DB_PATH) && existsSync(SIGNING_KEY_PATH) && existsSync(CONFIG_PATH);

      if (alreadyInit) {
        console.log('Noesis is already initialized.');
        console.log(`  Home:        ${NOESIS_HOME}`);
        console.log(`  Database:    ${DB_PATH}`);
        console.log(`  Signing key: ${SIGNING_KEY_PATH}`);
        console.log(`  Config:      ${CONFIG_PATH}`);
        return;
      }

      // Create directory structure
      const dirs = [
        NOESIS_HOME,
        MEMORY_DIR,
        SKILLS_DIR,
        ANTI_PATTERNS_DIR,
        COLD_STORAGE_DIR,
        BACKUPS_DIR,
        MODELS_DIR,
      ];

      for (const dir of dirs) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true, mode: FILE_PERMISSIONS['DIR'] });
          if (verbose) {
            console.log(`  Created directory: ${dir}`);
          }
        }
      }

      // Generate signing key (stored in keychain + file)
      if (!existsSync(SIGNING_KEY_PATH)) {
        generateSigningKey();
        if (verbose) {
          console.log(`  Generated signing key: ${SIGNING_KEY_PATH}`);
        }
      } else {
        // Verify existing key loads
        try {
          loadSigningKey();
        } catch {
          console.log('  Warning: Existing signing key could not be loaded. Regenerating.');
          generateSigningKey();
        }
      }

      // Create default config if missing
      if (!existsSync(CONFIG_PATH)) {
        const config = loadConfig();
        saveConfig(config);
        if (verbose) {
          console.log(`  Created config: ${CONFIG_PATH}`);
        }
      }

      // Initialize database (schema applied automatically by constructor)
      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();
        if (verbose) {
          console.log(`  Initialized database: ${DB_PATH}`);
        }
      } finally {
        db?.close();
      }

      // Enforce permissions on all managed paths
      enforcePermissions();

      console.log('Noesis initialized successfully.');
      console.log(`  Home:        ${NOESIS_HOME}`);
      console.log(`  Database:    ${DB_PATH}`);
      console.log(`  Signing key: ${SIGNING_KEY_PATH}`);
      console.log(`  Config:      ${CONFIG_PATH}`);
    });
}

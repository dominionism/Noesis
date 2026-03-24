/**
 * noesis quickstart — Interactive onboarding wizard
 *
 * Guides the user through initial setup: init, project registration,
 * and basic configuration.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

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
import { generateSigningKey } from '../../security/hmac.js';
import { loadConfig, saveConfig } from '../../config.js';
import { enforcePermissions } from '../../security/permissions.js';

async function ask(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function registerQuickstartCommand(program: Command): void {
  program
    .command('quickstart')
    .description('Interactive onboarding wizard')
    .action(async () => {
      console.log('Welcome to Noesis — Superintelligence Workflow System\n');
      console.log('This wizard will guide you through initial setup.\n');

      // Step 1: Check if already initialized
      if (existsSync(DB_PATH) && existsSync(SIGNING_KEY_PATH) && existsSync(CONFIG_PATH)) {
        console.log('Noesis is already initialized at:');
        console.log(`  ${NOESIS_HOME}\n`);

        const proceed = await ask('Re-run initialization? (y/N) ');
        if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
          console.log('Quickstart cancelled.');
          return;
        }
      }

      // Step 2: Create directories
      console.log('\nStep 1: Creating directory structure...');
      const dirs = [NOESIS_HOME, MEMORY_DIR, SKILLS_DIR, ANTI_PATTERNS_DIR, COLD_STORAGE_DIR, BACKUPS_DIR, MODELS_DIR];
      for (const dir of dirs) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true, mode: FILE_PERMISSIONS['DIR'] });
        }
      }
      console.log('  Done.\n');

      // Step 3: Generate signing key
      console.log('Step 2: Generating cryptographic signing key...');
      if (!existsSync(SIGNING_KEY_PATH)) {
        generateSigningKey();
        console.log('  Signing key created and stored.\n');
      } else {
        console.log('  Signing key already exists.\n');
      }

      // Step 4: Configuration
      console.log('Step 3: Configuration...');
      const config = loadConfig();

      const scanMode = await ask('  Secret scan mode (warn/redact) [redact]: ');
      if (scanMode === 'warn' || scanMode === 'redact') {
        config.secret_scan_mode = scanMode;
      }

      saveConfig(config);
      console.log('  Configuration saved.\n');

      // Step 5: Initialize database
      console.log('Step 4: Initializing database...');
      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();
        console.log('  Database ready.\n');
      } finally {
        db?.close();
      }

      // Step 6: Permissions
      console.log('Step 5: Enforcing file permissions...');
      enforcePermissions();
      console.log('  Done.\n');

      console.log('Noesis is ready.\n');
      console.log('Next steps:');
      console.log('  noesis status             — Check system health');
      console.log('  noesis project add <name> <path> — Register a project');
      console.log('  noesis remember <type> <title>    — Store your first memory');
      console.log('  noesis recall <query>             — Search memories');
    });
}

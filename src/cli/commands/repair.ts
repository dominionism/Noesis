/**
 * noesis repair — Repair signing key or database
 *
 * Provides recovery options when the signing key is lost or the
 * database is corrupted. Operates directly on the filesystem.
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';

import { DB_PATH, SIGNING_KEY_PATH } from '../../constants.js';
import { generateSigningKey, loadSigningKey } from '../../security/hmac.js';
import { DatabaseConnection } from '../../core/database.js';
import { enforcePermissions } from '../../security/permissions.js';

export function registerRepairCommand(program: Command): void {
  program
    .command('repair')
    .description('Repair signing key, database, or file permissions')
    .option('--signing-key', 'Regenerate the signing key (WARNING: invalidates all existing signatures)')
    .option('--database', 'Run integrity check and repair on the database')
    .option('--permissions', 'Fix file permissions on all managed paths')
    .action((options: {
      signingKey?: boolean;
      database?: boolean;
      permissions?: boolean;
    }) => {
      const globalOpts = program.opts();
      const repairs: string[] = [];

      // If no specific option, run all checks
      const runAll = !options.signingKey && !options.database && !options.permissions;

      // Signing key
      if (options.signingKey || runAll) {
        if (options.signingKey) {
          // Explicit regeneration
          generateSigningKey();
          repairs.push('Signing key regenerated (existing signatures are now invalid)');
        } else {
          // Just verify
          try {
            loadSigningKey();
            repairs.push('Signing key: OK');
          } catch {
            generateSigningKey();
            repairs.push('Signing key: was missing, regenerated');
          }
        }
      }

      // Database
      if (options.database || runAll) {
        if (!existsSync(DB_PATH)) {
          repairs.push('Database: not found (run `noesis init`)');
        } else {
          let db: DatabaseConnection | null = null;
          try {
            db = DatabaseConnection.create();
            const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
            const ok = result.length === 1 && result[0].integrity_check === 'ok';

            if (ok) {
              repairs.push('Database: integrity check passed');
            } else {
              repairs.push('Database: integrity issues detected');
              for (const row of result) {
                repairs.push(`  - ${row.integrity_check}`);
              }
            }
          } catch (err) {
            repairs.push(`Database: error - ${(err as Error).message}`);
          } finally {
            db?.close();
          }
        }
      }

      // Permissions
      if (options.permissions || runAll) {
        try {
          enforcePermissions();
          repairs.push('File permissions: corrected');
        } catch (err) {
          repairs.push(`File permissions: error - ${(err as Error).message}`);
        }
      }

      if (globalOpts.json) {
        console.log(JSON.stringify({ repairs }, null, 2));
      } else {
        console.log('Repair results:\n');
        for (const repair of repairs) {
          console.log(`  ${repair}`);
        }
      }
    });
}

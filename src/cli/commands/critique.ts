/**
 * noesis critique -- Run evidence-backed critique
 *
 * Evaluates proposals against stored memories and anti-patterns using
 * the 7-dimension enhanced critic system.
 *
 * Wired to: noesis.critiqueResearch, noesis.critiquePlan
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerCritiqueCommand(program: Command): void {
  program
    .command('critique <description>')
    .description('Run evidence-backed critique on a proposal')
    .option('--project <id>', 'Project ID')
    .option('--type <type>', 'Critique type: research or plan', 'plan')
    .option('--cycles <n>', 'Maximum critic cycles', parseInt)
    .action(async (description: string, options: { project?: string; type?: string; cycles?: number }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const critiqueType = options.type ?? 'plan';

        // Call the appropriate critique method based on type
        const method = critiqueType === 'research'
          ? 'noesis.critiqueResearch'
          : 'noesis.critiquePlan';

        const result = await client.call<Record<string, unknown>>(
          method,
          {
            work: description,
            max_iterations: Math.max(1, options.cycles ?? 1),
          },
        );

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Critique (${critiqueType}):`);
          console.log();

          if (result.overallAssessment) {
            console.log(`Assessment: ${result.overallAssessment}`);
          }

          console.log(`Severity: ${result.severity ?? 'unknown'}`);
          console.log(`Revision needed: ${result.revisionNeeded ? 'yes' : 'no'}`);
          if (result.iterationCount !== undefined) {
            console.log(`Iteration: ${result.iterationCount}`);
          }
          if (result.humanJudgmentRequired) {
            console.log('** Human judgment required **');
          }

          const findings = (result.findings ?? []) as Array<Record<string, unknown>>;
          if (findings.length > 0) {
            console.log();
            console.log(`Findings (${findings.length}):`);
            console.log();
            for (const f of findings) {
              const severity = String(f.severity ?? '').toUpperCase();
              console.log(`  [${severity}] (${f.dimension}) ${f.finding}`);
              if (f.evidence) {
                console.log(`    Evidence: ${f.evidence}`);
              }
              if (f.suggestion) {
                console.log(`    Suggestion: ${f.suggestion}`);
              }
            }
          } else {
            console.log();
            console.log('No findings.');
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}

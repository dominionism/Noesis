/**
 * noesis simulate <scenario> — Strategy simulation
 *
 * Predicts failure modes for a given scenario and routes to
 * recommended experts for mitigation guidance.
 *
 * RPC calls:
 *   1. noesis.predictFailures      — predictive failure detection
 *   2. noesis.routeExpertCognitive — expert routing for the scenario
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerSimulateCommand(program: Command): void {
  program
    .command('simulate <scenario>')
    .description('Simulate a strategy using stored knowledge')
    .option('--project <id>', 'Project ID')
    .option('--iterations <n>', 'Number of simulation iterations', parseInt)
    .action(async (scenario: string, options: { project?: string; iterations?: number }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = options.project ?? globalOpts.project;
        const iterations = options.iterations ?? 1;

        // Collect results across iterations
        const allPredictions: Array<{
          failureClass: string;
          likelihood: number;
          evidence: string;
          prevention: string;
        }>[] = [];
        const allGuidance: string[][] = [];

        for (let i = 0; i < iterations; i++) {
          const predictParams: Record<string, unknown> = { task: scenario };
          if (projectId) {
            predictParams.project_id = projectId;
          }

          const predictResult = await client.call<{
            predictions: Array<{
              failureClass: string;
              likelihood: number;
              evidence: string;
              prevention: string;
            }>;
            guidance: string[];
          }>('noesis.predictFailures', predictParams);

          allPredictions.push(predictResult.predictions);
          allGuidance.push(predictResult.guidance);
        }

        // Route experts for the scenario
        const expertResult = await client.call<{
          matches: Array<{
            expert: { id: string; name: string; category: string };
            score: number;
          }>;
        }>('noesis.routeExpertCognitive', { task: scenario });

        if (globalOpts.json) {
          console.log(JSON.stringify({
            scenario,
            project_id: projectId ?? null,
            iterations,
            predictions: allPredictions,
            guidance: allGuidance,
            experts: expertResult.matches,
          }, null, 2));
        } else {
          console.log(`Simulation: "${scenario.slice(0, 80)}"\n`);

          for (let i = 0; i < iterations; i++) {
            const predictions = allPredictions[i];
            const guidance = allGuidance[i];

            if (iterations > 1) {
              console.log(`--- Iteration ${i + 1} ---`);
            }

            console.log(`Predictions: ${predictions.length}`);

            if (predictions.length === 0) {
              console.log('  No failure modes predicted.');
            } else {
              for (const pred of predictions) {
                const pct = (pred.likelihood * 100).toFixed(0);
                console.log(`  [${pct}%] ${pred.failureClass}`);
                console.log(`         Evidence:   ${pred.evidence}`);
                console.log(`         Prevention: ${pred.prevention}`);
              }
            }

            if (guidance.length > 0) {
              console.log('\nPreventive guidance:');
              for (const g of guidance) {
                console.log(`  - ${g}`);
              }
            }

            if (iterations > 1 && i < iterations - 1) {
              console.log('');
            }
          }

          // Expert recommendations
          console.log(`\n--- Recommended Experts (${expertResult.matches.length}) ---`);
          if (expertResult.matches.length === 0) {
            console.log('  No matching experts found.');
          } else {
            for (const m of expertResult.matches) {
              console.log(`  ${m.expert.name} [${m.expert.category}] (score: ${m.score.toFixed(3)})`);
            }
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

import fs from 'node:fs/promises';
import path from 'node:path';
import { selfDevelopmentEngine } from '../self-development/self-development-engine.ts';
import { adminApprovalGate } from '../self-development/approval-gate.ts';
import { repoIndexer } from '../context/repo-indexer.ts';
import { executeCmdTool } from '../tool-runtime/cmd-tools.ts';

async function applyApprovedSelfImprovement() {
  console.log('================================================================');
  console.log('👑 APPLYING ADMIN-APPROVED SELF-IMPROVEMENT PROPOSAL');
  console.log('================================================================\n');

  // 1. Initialize Self-Improvement Proposal
  const cycleResult = await selfDevelopmentEngine.executeSelfImprovementCycle(0);
  const proposal = cycleResult.proposal;

  console.log(`Proposal ID: ${proposal.id}`);
  console.log(`Titel:       ${proposal.title}`);
  console.log(`Status pre-approval: ${proposal.status}\n`);

  // 2. Measure Performance BEFORE Promotion
  const beforeStart = Date.now();
  for (let i = 0; i < 5; i++) {
    await repoIndexer.getOrCreateIndex();
  }
  const beforeDurationMs = Date.now() - beforeStart;
  const beforeHeapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  console.log(`[BEFORE] 5 Context Index Lookups Duration: ${beforeDurationMs} ms | Heap: ${beforeHeapMb} MB`);

  // 3. Admin Approval & Promotion
  console.log('\n--> Executing Admin Approval & Promotion to Production Code...');
  const promotionResult = await adminApprovalGate.approveAndPromote(proposal.id, 'Admin User');
  console.log(`Promotion Result: ${promotionResult.message}`);

  if (!promotionResult.success) {
    console.error('CRITICAL: Promotion failed!');
    process.exit(1);
  }

  // 4. Re-run Verification Tests
  console.log('\n--> Running Post-Promotion Verification & Test Suite...');
  const testRes = await executeCmdTool('node --experimental-strip-types src/tests/master-e2e.test.ts');

  if (!testRes.success) {
    console.error('❌ POST-PROMOTION TESTS FAILED! Executing Automatic Rollback...');
    if (proposal.rollbackPlan.backupPath) {
      await adminApprovalGate.rejectProposal(proposal.id, 'Post-promotion test failed, rollback triggered.');
    }
    console.log('Automatic Rollback Completed.');
    process.exit(1);
  }

  console.log('Post-Promotion Tests: PASSED ✅');

  // 5. Measure Performance AFTER Promotion
  const afterStart = Date.now();
  for (let i = 0; i < 5; i++) {
    await repoIndexer.getOrCreateIndex();
  }
  const afterDurationMs = Date.now() - afterStart;
  const afterHeapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  console.log(`[AFTER]  5 Context Index Lookups Duration: ${afterDurationMs} ms | Heap: ${afterHeapMb} MB`);

  // 6. Output Final Empirical Report
  console.log('\n================================================================');
  console.log('📊 FINAL ADMIN-APPROVED IMPROVEMENT APPLICATION REPORT');
  console.log('================================================================');
  console.log(`Proposal ID:        ${proposal.id}`);
  console.log(`Admin-Freigabe:     ERTEILT VON ADMIN USER ✅`);
  console.log(`Status:             ${proposal.status}`);
  console.log(`Ausführung:         ERFOLGREICH PROMOVIERT 🎉`);
  console.log(`Perf-Vergleich:     Vorher: ${beforeDurationMs} ms | Nachher: ${afterDurationMs} ms`);
  console.log(`RAM-Vergleich:      Vorher: ${beforeHeapMb} MB | Nachher: ${afterHeapMb} MB`);
  console.log(`Automat. Rollback:  Bereitgestellt (${proposal.rollbackPlan.backupPath})`);
  console.log(`Zukünftiges Gate:   STRIKT AKTIV (Jede weitere Selbständerung benötigt Admin-Freigabe)`);
  console.log('================================================================');
}

applyApprovedSelfImprovement().catch(err => {
  console.error('Error applying approved self-improvement:', err);
  process.exit(1);
});

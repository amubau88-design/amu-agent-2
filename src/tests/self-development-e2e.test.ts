import fs from 'node:fs/promises';
import path from 'node:path';
import { selfDevelopmentEngine } from '../self-development/self-development-engine.ts';
import { adminApprovalGate } from '../self-development/approval-gate.ts';

async function runSelfDevelopmentE2ETest() {
  console.log('================================================================');
  console.log('🛡️ RUNNING CONTROLLED SELF-DEVELOPMENT E2E VERIFICATION TEST');
  console.log('================================================================\n');

  // 1. Execute Self-Improvement Cycle
  const cycleResult = await selfDevelopmentEngine.executeSelfImprovementCycle(0);
  const proposal = cycleResult.proposal;

  console.log('[1] Self-Analysis Completed.');
  console.log(`[2] Proposal Generated: '${proposal.title}' (ID: ${proposal.id})`);
  console.log(`[3] Staging Sandbox Evaluation Results:`);
  console.log(`    - Sandbox Syntax/Security Pass: ${proposal.sandboxTestResult?.securityCheckPassed}`);
  console.log(`    - Before Latency: ${proposal.sandboxTestResult?.beforeResponseTimeMs} ms -> After: ${proposal.sandboxTestResult?.afterResponseTimeMs} ms`);
  console.log(`[4] Status at Admin Approval Gate: ${proposal.status}`);
  console.log(`    - Stopped at Gate: ${cycleResult.stoppedAtGate}`);

  // Verify Production File Remains Untouched
  const targetFile = proposal.targetFiles[0];
  const prodContent = await fs.readFile(targetFile, 'utf-8');
  const untouched = !prodContent.includes('Candidate Self-Improvement Code');

  console.log(`[5] Production File Untouched Verification: ${untouched ? 'PASSED ✅' : 'FAILED ❌'}`);

  // Summary Gate Output
  console.log('\n================================================================');
  console.log('📋 SELF-DEVELOPMENT IMPROVEMENT PROPOSAL REPORT');
  console.log('================================================================');
  console.log(`Proposal ID:        ${proposal.id}`);
  console.log(`Titel:              ${proposal.title}`);
  console.log(`Kategorie:          ${proposal.category}`);
  console.log(`Beschreibung:       ${proposal.description}`);
  console.log(`Betroffene Dateien: ${proposal.targetFiles.join(', ')}`);
  console.log(`Risikobewertung:   ${proposal.riskAssessment.level}`);
  console.log(`Mögliche Effekte:   ${proposal.riskAssessment.potentialSideEffects.join('; ')}`);
  console.log(`Erwarteter Nutzen:  ${proposal.expectedBenefits.join('; ')}`);
  console.log(`Rollback-Plan:      ${proposal.rollbackPlan.rollbackCommand}`);
  console.log(`Gate-Status:        ${proposal.status} (Wartet auf Admin-Freigabe)`);
  console.log('----------------------------------------------------------------');
  console.log(`PRODUKTIONSCODE VERÄNDERT: NEIN 🛡️ (Sicherheits-Gate aktiv)`);
  console.log('================================================================');

  if (!untouched || proposal.status !== 'PENDING_ADMIN_APPROVAL') {
    console.error('CRITICAL: Admin Gate was bypassed or failed!');
    process.exit(1);
  }
}

runSelfDevelopmentE2ETest().catch(err => {
  console.error('Self-development E2E test failed:', err);
  process.exit(1);
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { selfDevelopmentEngine } from '../self-development/self-development-engine.ts';
import { adminApprovalGate } from '../self-development/approval-gate.ts';

async function testSelfDevelopmentRules() {
  console.log('================================================================');
  console.log('🛡️ VERIFYING SELF-DEVELOPMENT PERMANENT CYCLE & ADMIN GATE RULES');
  console.log('================================================================\n');

  const testResults: Array<{ point: string; passed: boolean; details: string }> = [];

  // 1. Point 1 & 2: Recognize new improvement & perform Sandbox test
  console.log('--- Point 1 & 2: Self-Analysis & Sandbox Evaluation ---');
  const cycleResult = await selfDevelopmentEngine.executeSelfImprovementCycle(1); // Select opportunity #1
  const proposal = cycleResult.proposal;

  const pass1_2 = proposal.id.startsWith('imp_') && proposal.sandboxTestResult !== undefined;
  console.log(`Proposal ID: ${proposal.id} | Category: ${proposal.category}`);
  console.log(`Sandbox Security Pass: ${proposal.sandboxTestResult?.securityCheckPassed}`);
  testResults.push({
    point: '1 & 2. Self-Analysis & Sandbox Staging Test',
    passed: pass1_2,
    details: `Generated ID ${proposal.id}, Staging evaluation passed`,
  });

  // 2. Point 3: Request Admin Approval exactly once (Status = PENDING_ADMIN_APPROVAL)
  console.log('\n--- Point 3: Admin Gate Registration ---');
  const pass3 = proposal.status === 'PENDING_ADMIN_APPROVAL' && cycleResult.stoppedAtGate;
  console.log(`Gate Status: ${proposal.status} | Stopped at Gate: ${cycleResult.stoppedAtGate}`);
  testResults.push({
    point: '3. Single Admin Gate Stopp Trigger',
    passed: pass3,
    details: `Status is PENDING_ADMIN_APPROVAL, execution stopped at gate`,
  });

  // 3. Point 4: Without Approval -> ZERO Production Changes
  console.log('\n--- Point 4: Zero Production Modification Without Approval ---');
  const targetFile = proposal.targetFiles[0];
  const originalContent = await fs.readFile(targetFile, 'utf-8');
  const pass4 = !originalContent.includes('Candidate Self-Improvement Code');
  console.log(`Production File Untouched Check: ${pass4 ? 'PASSED ✅' : 'FAILED ❌'}`);
  testResults.push({
    point: '4. Zero Production Code Changes Without Admin Approval',
    passed: pass4,
    details: `Production file '${path.basename(targetFile)}' remains 100% untouched`,
  });

  // 4. Point 5 & 6: Promote exactly once upon explicit Approval & verify
  console.log('\n--- Point 5 & 6: Admin Approval Promotion & Post-Verification ---');
  const promoteRes = await adminApprovalGate.approveAndPromote(proposal.id, 'Admin Owner');
  const pass5_6 = promoteRes.success && proposal.status === 'PROMOTED';
  console.log(`Promotion Result: ${promoteRes.message}`);
  testResults.push({
    point: '5 & 6. Promotion upon Approval & Post-Verification',
    passed: pass5_6,
    details: `Promoted status: ${proposal.status}`,
  });

  // 5. Point 7: Prevent Re-Approval Loop for the same Proposal ID
  console.log('\n--- Point 7: Deduplication & Re-Approval Loop Prevention ---');
  const reApproveRes = await adminApprovalGate.approveAndPromote(proposal.id, 'Admin Owner');
  const pass7 = !reApproveRes.success && reApproveRes.message.includes('DEDUPLICATION GUARD');
  console.log(`Re-Approval Attempt Result: ${reApproveRes.message}`);
  testResults.push({
    point: '7. Deduplication Guard (No Approval-Loop)',
    passed: pass7,
    details: `Re-approval blocked successfully by Deduplication Guard`,
  });

  // Final Summary
  console.log('\n================================================================');
  console.log('📋 SELF-DEVELOPMENT CYCLE RULES VERIFICATION REPORT');
  console.log('================================================================');
  let allPassed = true;
  for (const r of testResults) {
    if (!r.passed) allPassed = false;
    console.log(`${r.passed ? '✅ [PASS]' : '❌ [FAIL]'} ${r.point}`);
    console.log(`   Details: ${r.details}`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`ALL 7 CYCLE RULES VERIFIED: ${allPassed ? '100% COMPLIANT 🎉' : 'NON-COMPLIANT ⚠️'}`);
  console.log('================================================================');

  if (!allPassed) process.exit(1);
}

testSelfDevelopmentRules().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

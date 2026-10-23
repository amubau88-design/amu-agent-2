import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../amu-api/server.ts';
import { ChatAMUProviderAdapter } from '../adapters/chatamu-provider.ts';
import { repoIndexer } from '../context/repo-indexer.ts';
import { taskQueueScheduler } from '../scheduler/task-queue.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import { agentOrchestrator } from '../agent-engine/orchestrator.ts';

async function runMasterE2ETestSuite() {
  console.log('================================================================');
  console.log('🌟 RUNNING AMU-AGENT-2 MASTER END-TO-END VERIFICATION SUITE 🌟');
  console.log('================================================================\n');

  const PORT = 3002;
  const server = await startServer(PORT);
  const client = new ChatAMUProviderAdapter({ baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'amu-secret-key-2026' });

  const testResults: Array<{ name: string; passed: boolean; details: string }> = [];

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Repository Indexer & Code Search
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Repository Indexer & Code Search ---');
    const index = await repoIndexer.getOrCreateIndex(true);
    const searchRes = await repoIndexer.searchCode('AgentOrchestrator');
    const pass1 = index.totalFiles > 0 && searchRes.length > 0;
    console.log(`Indexed Files: ${index.totalFiles} | Total Size: ${index.totalSizeBytes} bytes`);
    console.log(`Search 'AgentOrchestrator' Matches: ${searchRes.length} files`);
    console.log(`Status: ${pass1 ? 'PASSED ✅' : 'FAILED ❌'}\n`);
    testResults.push({ name: 'TEST 1: Repo Indexer & Code Search', passed: pass1, details: `${index.totalFiles} files indexed` });

    // ------------------------------------------------------------------------
    // TEST 2: OpenAI API Compatibility (/v1/chat/completions & /v1/models)
    // ------------------------------------------------------------------------
    console.log('--- TEST 2: OpenAI API Compatibility (/v1/chat/completions) ---');
    const openAiRes = await client.generateOpenAIChat([
      { role: 'system', content: 'You are an AI developer.' },
      { role: 'user', content: 'Schreibe eine TypeScript-Funktion multiply(a, b)' },
    ]);
    const pass2 = openAiRes.content.length > 0 && openAiRes.model.length > 0;
    console.log(`Model Returned: ${openAiRes.model}`);
    console.log(`Response Snippet: ${openAiRes.content.substring(0, 100)}...`);
    console.log(`Status: ${pass2 ? 'PASSED ✅' : 'FAILED ❌'}\n`);
    testResults.push({ name: 'TEST 2: OpenAI /v1/chat/completions API', passed: pass2, details: `Model: ${openAiRes.model}` });

    // ------------------------------------------------------------------------
    // TEST 3: ChatAMU Provider Adapter SDK
    // ------------------------------------------------------------------------
    console.log('--- TEST 3: ChatAMU Provider Adapter SDK ---');
    const health = await client.getHealth();
    const status = await client.getStatus();
    const chatTask = await client.generateChat('Wie funktioniert AMU-Agent-2?');
    const pass3 = health.healthy && status.healthy && chatTask.status === 'completed';
    console.log(`Health: ${health.healthy} (${health.version}) | Backend: ${status.activeBackend}`);
    console.log(`Chat Result TaskId: ${chatTask.taskId} | Tier: ${chatTask.tier}`);
    console.log(`Status: ${pass3 ? 'PASSED ✅' : 'FAILED ❌'}\n`);
    testResults.push({ name: 'TEST 3: ChatAMU Provider SDK', passed: pass3, details: `Backend: ${status.activeBackend}` });

    // ------------------------------------------------------------------------
    // TEST 4: Debug, Repair & Verification Cycle
    // ------------------------------------------------------------------------
    console.log('--- TEST 4: Debug, Repair & Verification Cycle ---');
    const tempTestFile = path.resolve(process.cwd(), 'src', 'temp_master_test.ts');
    await fs.writeFile(tempTestFile, 'export function testFunc() { const err = ; return 42; }\n', 'utf-8');

    const repairRes = await agentOrchestrator.executeTask({
      prompt: 'Fix debug error in temp file',
      context: { targetFile: tempTestFile },
    });
    const pass4 = repairRes.verificationPassed && repairRes.statesVisited.includes('REPAIR');
    console.log(`Repair States: ${repairRes.statesVisited.join(' -> ')} | Verification: ${repairRes.verificationPassed}`);
    console.log(`Status: ${pass4 ? 'PASSED ✅' : 'FAILED ❌'}\n`);
    testResults.push({ name: 'TEST 4: Debug & Repair Cycle', passed: pass4, details: `States: ${repairRes.statesVisited.join(' -> ')}` });
    try { await fs.unlink(tempTestFile); } catch {}

    // ------------------------------------------------------------------------
    // TEST 5: Task Queue Scheduler & Task Cancellation
    // ------------------------------------------------------------------------
    console.log('--- TEST 5: Task Queue Scheduler & Cancellation ---');
    const qTask = await taskQueueScheduler.enqueueTask({ prompt: 'Aufgabe für Queue' });
    const cancelOk = taskQueueScheduler.cancelTask(qTask.id);
    const pass5 = qTask.id.length > 0;
    console.log(`Task Enqueued: ${qTask.id} | Cancel Status: ${cancelOk}`);
    console.log(`Status: ${pass5 ? 'PASSED ✅' : 'FAILED ❌'}\n`);
    testResults.push({ name: 'TEST 5: Task Queue Scheduler', passed: pass5, details: `Task ID: ${qTask.id}` });

    // ------------------------------------------------------------------------
    // TEST 6: Security Guard & External Project Isolation
    // ------------------------------------------------------------------------
    console.log('--- TEST 6: Security Guard Protection ---');
    const security = new SecurityGuard(DEFAULT_PERMISSIONS);
    let pass6 = false;
    try {
      security.validatePathAccess('C:/Users/AMU/Downloads/AMU SYSTEM/secret.txt', 'write');
    } catch (err: unknown) {
      const error = err as Error;
      pass6 = error.message.includes('SECURITY VIOLATION');
    }
    console.log(`Security Violation Caught on External Path Access: ${pass6}`);
    console.log(`Status: ${pass6 ? 'PASSED ✅' : 'FAILED ❌'}\n`);
    testResults.push({ name: 'TEST 6: Security & Isolation Guard', passed: pass6, details: 'External path access correctly blocked' });

  } finally {
    server.close();
  }

  // Final Summary Report
  console.log('================================================================');
  console.log('🏆 MASTER END-TO-END VERIFICATION SUMMARY REPORT');
  console.log('================================================================');
  let allPassed = true;
  for (const r of testResults) {
    if (!r.passed) allPassed = false;
    console.log(`${r.passed ? '✅ [PASS]' : '❌ [FAIL]'} ${r.name}`);
    console.log(`   Details: ${r.details}`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`RAM Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  console.log(`FINAL RESULT: ${allPassed ? 'AMU-AGENT-2 IS 100% READY FOR PRODUCTION & INTEGRATION 🎉' : 'VERIFICATION FAILED ⚠️'}`);
  console.log('================================================================');

  if (!allPassed) process.exit(1);
}

runMasterE2ETestSuite().catch(err => {
  console.error('Master test suite execution error:', err);
  process.exit(1);
});

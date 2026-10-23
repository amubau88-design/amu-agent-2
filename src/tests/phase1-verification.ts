import fs from 'node:fs/promises';
import { agentOrchestrator } from '../agent-engine/orchestrator.ts';
import { aiRuntimeManager } from '../ai-runtime/runtime-manager.ts';
import { startServer } from '../amu-api/server.ts';
import { writeFileTool, readFileTool } from '../tool-runtime/file-tools.ts';
import path from 'node:path';

async function runPhase1TestSuite() {
  console.log('================================================================');
  console.log('🚀 RUNNING AMU-AGENT-2 PHASE 1 VERIFICATION & BENCHMARK SUITE');
  console.log('================================================================\n');

  const testResults: Array<{ name: string; passed: boolean; details: string; metrics: unknown }> = [];

  // Start HTTP Server on test port 3001
  const server = await startServer(3001);
  const apiKey = 'amu-secret-key-2026';

  try {
    // ------------------------------------------------------------------------
    // TEST A: "Hallo" (GREETING Route, 0 tools, minimal path)
    // ------------------------------------------------------------------------
    console.log('--- TEST A: "Hallo" (GREETING) ---');
    const startA = Date.now();
    const resA = await agentOrchestrator.executeTask({ prompt: 'Hallo!' });
    const durationA = Date.now() - startA;

    const passA = resA.tier === 'GREETING' && resA.loadedToolsCount === 0 && resA.status === 'completed';
    console.log(`Tier: ${resA.tier} | Tools: ${resA.loadedToolsCount} | TTFT: ${resA.metrics.ttftMs}ms | Total: ${durationA}ms`);
    console.log(`Output: ${resA.finalOutput}`);
    console.log(`Status: ${passA ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    testResults.push({
      name: 'TEST A: Greeting Fast Path',
      passed: passA,
      details: `Tier: ${resA.tier}, Tools: ${resA.loadedToolsCount}`,
      metrics: resA.metrics,
    });

    // ------------------------------------------------------------------------
    // TEST B: Wissensfrage (KNOWLEDGE Route, 0 tools)
    // ------------------------------------------------------------------------
    console.log('--- TEST B: Wissensfrage (KNOWLEDGE) ---');
    const startB = Date.now();
    const resB = await agentOrchestrator.executeTask({ prompt: 'Was ist das Ziel von AMU-Agent-2?' });
    const durationB = Date.now() - startB;

    const passB = resB.tier === 'KNOWLEDGE' && resB.loadedToolsCount === 0 && resB.status === 'completed';
    console.log(`Tier: ${resB.tier} | Tools: ${resB.loadedToolsCount} | TTFT: ${resB.metrics.ttftMs}ms | Total: ${durationB}ms`);
    console.log(`Output: ${resB.finalOutput}`);
    console.log(`Status: ${passB ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    testResults.push({
      name: 'TEST B: Knowledge Inquiry',
      passed: passB,
      details: `Tier: ${resB.tier}, Tools: ${resB.loadedToolsCount}`,
      metrics: resB.metrics,
    });

    // ------------------------------------------------------------------------
    // TEST C: Kleine Coding-Aufgabe (CODE Route, coding tools)
    // ------------------------------------------------------------------------
    console.log('--- TEST C: Kleine Coding-Aufgabe (CODE) ---');
    const startC = Date.now();
    const resC = await agentOrchestrator.executeTask({ prompt: 'Schreibe eine TypeScript-Funktion add(a, b)' });
    const durationC = Date.now() - startC;

    const passC = resC.tier === 'CODE' && resC.loadedToolsCount > 0 && resC.status === 'completed';
    console.log(`Tier: ${resC.tier} | Tools Loaded: [${resC.loadedTools.join(', ')}] | Total: ${durationC}ms`);
    console.log(`Output: ${resC.finalOutput}`);
    console.log(`Status: ${passC ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    testResults.push({
      name: 'TEST C: Code Generation',
      passed: passC,
      details: `Tier: ${resC.tier}, Tools Loaded: ${resC.loadedTools.join(', ')}`,
      metrics: resC.metrics,
    });

    // ------------------------------------------------------------------------
    // TEST D: Debug-Aufgabe mit Datei/Test (DEBUG Route, repair cycle)
    // ------------------------------------------------------------------------
    console.log('--- TEST D: Debug-Aufgabe (DEBUG & REPAIR) ---');
    const tempFile = path.resolve(process.cwd(), 'src', 'temp_debug_test.ts');
    // Write invalid syntax directly using fs.writeFile
    const brokenCode = 'export function divide(a: number, b: number) {\n  const invalidSyntax = ;\n  return a / b;\n}\n';
    await fs.writeFile(tempFile, brokenCode, 'utf-8');

    const startD = Date.now();
    const resD = await agentOrchestrator.executeTask({
      prompt: 'Fix debug error: division by zero exception in test file',
      context: { targetFile: tempFile },
    });
    const durationD = Date.now() - startD;

    const passD = resD.tier === 'DEBUG' && resD.verificationPassed && resD.statesVisited.includes('REPAIR');
    console.log(`Tier: ${resD.tier} | States Visited: ${resD.statesVisited.join(' -> ')} | Verification: ${resD.verificationPassed}`);
    console.log(`Status: ${passD ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    testResults.push({
      name: 'TEST D: Debug & Repair Cycle',
      passed: passD,
      details: `States Visited: ${resD.statesVisited.join(' -> ')}`,
      metrics: resD.metrics,
    });

    // ------------------------------------------------------------------------
    // TEST E: Mehrstufige Developer-Aufgabe (FULL_AGENT Route)
    // ------------------------------------------------------------------------
    console.log('--- TEST E: Mehrstufige Developer-Aufgabe (FULL_AGENT) ---');
    const startE = Date.now();
    const resE = await agentOrchestrator.executeTask({ prompt: 'Bau ein komplettes neues Modul mit Planung, Ausführung und Verifikation' });
    const durationE = Date.now() - startE;

    const passE = resE.tier === 'FULL_AGENT' && resE.statesVisited.includes('PLAN') && resE.status === 'completed';
    console.log(`Tier: ${resE.tier} | Iterations: ${resE.iterations} | States: ${resE.statesVisited.join(' -> ')}`);
    console.log(`Status: ${passE ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    testResults.push({
      name: 'TEST E: Full Agent End-to-End Task',
      passed: passE,
      details: `Iterations: ${resE.iterations}, States: ${resE.statesVisited.join(' -> ')}`,
      metrics: resE.metrics,
    });

    // ------------------------------------------------------------------------
    // TEST F: HTTP REST AMU API Endpoints Verification
    // ------------------------------------------------------------------------
    console.log('--- TEST F: HTTP REST AMU API Verification ---');
    const healthRes = await fetch('http://127.0.0.1:3001/api/v1/health');
    const healthData = await healthRes.json() as { success: boolean };

    const statusRes = await fetch('http://127.0.0.1:3001/api/v1/runtime/status');
    const statusData = await statusRes.json() as { success: boolean };

    const chatRes = await fetch('http://127.0.0.1:3001/api/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AMU-API-Key': apiKey,
      },
      body: JSON.stringify({ prompt: 'Hallo über REST API!' }),
    });
    const chatData = await chatRes.json() as { success: boolean; data: { taskId: string } };

    const passF = healthData.success && statusData.success && chatData.success;
    console.log(`API Health: ${healthData.success} | Status: ${statusData.success} | Chat API: ${chatData.success}`);
    console.log(`Status: ${passF ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    testResults.push({
      name: 'TEST F: AMU API Endpoints',
      passed: passF,
      details: `Health, Status & Chat endpoints verified over HTTP`,
      metrics: { httpStatus: chatRes.status },
    });

  } finally {
    try { await fs.unlink(tempFile); } catch {}
    server.close();
  }

  // Summary Report
  console.log('================================================================');
  console.log('📊 FINAL PHASE 1 BENCHMARK & VERIFICATION SUMMARY REPORT');
  console.log('================================================================');
  let allPassed = true;
  for (const r of testResults) {
    if (!r.passed) allPassed = false;
    console.log(`${r.passed ? '✅ [PASS]' : '❌ [FAIL]'} ${r.name}`);
    console.log(`   Details: ${r.details}`);
    console.log(`   Metrics: ${JSON.stringify(r.metrics)}`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`RAM Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  console.log(`OVERALL RESULT: ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY 🎉' : 'SOME TESTS FAILED ⚠️'}`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase1TestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});

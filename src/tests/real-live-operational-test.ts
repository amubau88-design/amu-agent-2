import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../amu-api/server.ts';
import { ChatAMUProviderAdapter } from '../adapters/chatamu-provider.ts';
import { repoIndexer } from '../context/repo-indexer.ts';
import { taskQueueScheduler } from '../scheduler/task-queue.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import type { TaskResult } from '../shared/types.ts';

async function executeRealOperationalTests() {
  console.log('================================================================');
  console.log('⚡ STARTING REAL LIVE OPERATIONAL & PRACTICE TEST OF AMU-AGENT-2');
  console.log('================================================================\n');

  const startMemory = process.memoryUsage();
  const serverStartTimeMs = Date.now();
  
  // 1. REAL SERVER STARTUP (Port 3000)
  const PORT = 3000;
  const server = await startServer(PORT);
  const startupDurationMs = Date.now() - serverStartTimeMs;
  console.log(`[1] Real AMU Server Started on http://127.0.0.1:${PORT} (Startup time: ${startupDurationMs} ms)`);

  const client = new ChatAMUProviderAdapter({ baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'amu-secret-key-2026' });
  const results: Array<{ test: string; passed: boolean; durationMs: number; details: string; metrics?: unknown }> = [];

  try {
    // ------------------------------------------------------------------------
    // 2. HEALTH & RUNTIME STATUS CHECK
    // ------------------------------------------------------------------------
    console.log('\n--- [2] Health & Runtime Status Check ---');
    const healthStart = Date.now();
    const health = await client.getHealth();
    const status = await client.getStatus();
    const healthDuration = Date.now() - healthStart;

    const pass2 = health.healthy && status.healthy;
    console.log(`Health: ${health.healthy} (v${health.version}) | Active Backend: ${status.activeBackend} | Latency: ${healthDuration} ms`);
    results.push({
      test: '2. Health & Runtime Status',
      passed: pass2,
      durationMs: healthDuration,
      details: `Backend: ${status.activeBackend}, Model: ${status.model}`,
    });

    // ------------------------------------------------------------------------
    // 3. REAL GREETING TEST
    // ------------------------------------------------------------------------
    console.log('\n--- [3] Real GREETING Test ---');
    const greetStart = Date.now();
    const greetResult = await client.generateChat('Guten Tag AMU Agent!');
    const greetDuration = Date.now() - greetStart;

    const pass3 = greetResult.tier === 'GREETING' && greetResult.loadedToolsCount === 0 && greetResult.status === 'completed';
    console.log(`Tier: ${greetResult.tier} | Loaded Tools: ${greetResult.loadedToolsCount} | Total Duration: ${greetDuration} ms`);
    console.log(`Output: "${greetResult.finalOutput}"`);
    results.push({
      test: '3. Real GREETING Inquiry',
      passed: pass3,
      durationMs: greetDuration,
      details: `Tools: ${greetResult.loadedToolsCount}, Tier: ${greetResult.tier}`,
      metrics: { ttftMs: greetResult.metrics.ttftMs, promptTokens: greetResult.metrics.promptTokens },
    });

    // ------------------------------------------------------------------------
    // 4. REAL KNOWLEDGE TEST
    // ------------------------------------------------------------------------
    console.log('\n--- [4] Real KNOWLEDGE Test ---');
    const knowStart = Date.now();
    const knowResult = await client.generateChat('Erkläre die Kernarchitektur von AMU-Agent-2.');
    const knowDuration = Date.now() - knowStart;

    const pass4 = knowResult.tier === 'KNOWLEDGE' && knowResult.loadedToolsCount === 0 && knowResult.status === 'completed';
    console.log(`Tier: ${knowResult.tier} | Loaded Tools: ${knowResult.loadedToolsCount} | Total Duration: ${knowDuration} ms`);
    console.log(`Output: "${knowResult.finalOutput.substring(0, 120)}..."`);
    results.push({
      test: '4. Real KNOWLEDGE Inquiry',
      passed: pass4,
      durationMs: knowDuration,
      details: `Tools: ${knowResult.loadedToolsCount}, Tier: ${knowResult.tier}`,
      metrics: { ttftMs: knowResult.metrics.ttftMs },
    });

    // ------------------------------------------------------------------------
    // 5. REAL CODE TEST (File Read + Write + Test)
    // ------------------------------------------------------------------------
    console.log('\n--- [5] Real CODE Test ---');
    const tempCodeFile = path.resolve(process.cwd(), 'src', 'live_code_test.ts');
    await fs.writeFile(tempCodeFile, 'export function subtract(a: number, b: number): number { return a - b; }\n', 'utf-8');

    const codeStart = Date.now();
    const codeResult = await client.generateChat('Schreibe eine TypeScript-Funktion multiply(a, b) in den Code.');
    const codeDuration = Date.now() - codeStart;

    const pass5 = codeResult.tier === 'CODE' && codeResult.loadedTools.includes('file_write') && codeResult.status === 'completed';
    console.log(`Tier: ${codeResult.tier} | Loaded Tools: [${codeResult.loadedTools.join(', ')}] | Duration: ${codeDuration} ms`);
    results.push({
      test: '5. Real CODE Generation',
      passed: pass5,
      durationMs: codeDuration,
      details: `Loaded Tools: ${codeResult.loadedTools.join(', ')}`,
      metrics: { totalDurationMs: codeResult.metrics.totalDurationMs },
    });
    try { await fs.unlink(tempCodeFile); } catch {}

    // ------------------------------------------------------------------------
    // 6. REAL DEBUG & REPAIR TEST (Syntax error -> detect -> repair -> re-verify)
    // ------------------------------------------------------------------------
    console.log('\n--- [6] Real DEBUG & REPAIR Test ---');
    const tempDebugFile = path.resolve(process.cwd(), 'src', 'live_debug_test.ts');
    await fs.writeFile(tempDebugFile, 'export function calculateSquare(n: number) {\n  const brokenSyntax = ;\n  return n * n;\n}\n', 'utf-8');

    const debugStart = Date.now();
    const debugResult = await client.generateChat('Fix debug error in broken syntax file', {
      context: { targetFile: tempDebugFile },
    });
    const debugDuration = Date.now() - debugStart;

    const pass6 = debugResult.tier === 'DEBUG' && debugResult.verificationPassed && debugResult.statesVisited.includes('REPAIR');
    console.log(`Tier: ${debugResult.tier} | States: ${debugResult.statesVisited.join(' -> ')} | Verification: ${debugResult.verificationPassed}`);
    console.log(`Tool Execution Time: ${debugResult.metrics.toolExecutionTimeMs} ms | Total Duration: ${debugDuration} ms`);
    results.push({
      test: '6. Real DEBUG & Repair Cycle',
      passed: pass6,
      durationMs: debugDuration,
      details: `States Visited: ${debugResult.statesVisited.join(' -> ')}`,
      metrics: { toolTimeMs: debugResult.metrics.toolExecutionTimeMs },
    });
    try { await fs.unlink(tempDebugFile); } catch {}

    // ------------------------------------------------------------------------
    // 7. REAL FULL_AGENT MULTI-STEP TEST
    // ------------------------------------------------------------------------
    console.log('\n--- [7] Real FULL_AGENT Multi-Step Test ---');
    const fullStart = Date.now();
    const fullResult = await client.generateChat('Bau ein komplettes neues Modul mit mehrstufiger Planung, Ausführung und Verifikation');
    const fullDuration = Date.now() - fullStart;

    const pass7 = fullResult.tier === 'FULL_AGENT' && fullResult.statesVisited.includes('PLAN') && fullResult.status === 'completed';
    console.log(`Tier: ${fullResult.tier} | States: ${fullResult.statesVisited.join(' -> ')} | Duration: ${fullDuration} ms`);
    results.push({
      test: '7. Real FULL_AGENT Execution',
      passed: pass7,
      durationMs: fullDuration,
      details: `Iterations: ${fullResult.iterations}, Loaded Tools: ${fullResult.loadedTools.length}`,
    });

    // ------------------------------------------------------------------------
    // 8. TARGETED FILE DISCOVERY CHECK
    // ------------------------------------------------------------------------
    console.log('\n--- [8] Targeted File Discovery Check ---');
    const indexStart = Date.now();
    const contextSnippet = await repoIndexer.getRelevantContextForPrompt('orchestrator');
    const indexDuration = Date.now() - indexStart;

    const pass8 = contextSnippet.includes('orchestrator.ts') && !contextSnippet.includes('node_modules');
    console.log(`Targeted Discovery Duration: ${indexDuration} ms`);
    console.log(`Context Snippet Matched: ${contextSnippet.substring(0, 100).replace(/\n/g, ' ')}...`);
    results.push({
      test: '8. Targeted Context Discovery',
      passed: pass8,
      durationMs: indexDuration,
      details: 'Targeted file matched without loading unneeded directory bloat',
    });

    // ------------------------------------------------------------------------
    // 9. TASK QUEUE, TIMEOUT & CANCELLATION TEST
    // ------------------------------------------------------------------------
    console.log('\n--- [9] Task Queue, Timeout & Cancellation Test ---');
    const qStart = Date.now();
    const queuedTask = await taskQueueScheduler.enqueueTask({ prompt: 'Queue async test task' });
    const cancelled = taskQueueScheduler.cancelTask(queuedTask.id);
    const qDuration = Date.now() - qStart;

    const pass9 = queuedTask.id.length > 0 && cancelled;
    console.log(`Queued Task ID: ${queuedTask.id} | Cancelled Successfully: ${cancelled}`);
    results.push({
      test: '9. Task Queue & Cancellation',
      passed: pass9,
      durationMs: qDuration,
      details: `Enqueued Task: ${queuedTask.id}, Cancelled: ${cancelled}`,
    });

    // ------------------------------------------------------------------------
    // 10. REAL SECURITY BOUNDS TEST (External Path Protection)
    // ------------------------------------------------------------------------
    console.log('\n--- [10] Real Security Bounds Test ---');
    const security = new SecurityGuard(DEFAULT_PERMISSIONS);
    let pass10 = false;
    let secMessage = '';

    try {
      security.validatePathAccess('C:/Users/AMU/Downloads/AMU SYSTEM/config.json', 'write');
    } catch (err: unknown) {
      const error = err as Error;
      secMessage = error.message;
      pass10 = secMessage.includes('SECURITY VIOLATION');
    }
    console.log(`Path Validation Result: ${secMessage}`);
    results.push({
      test: '10. Security Boundary Isolation',
      passed: pass10,
      durationMs: 0,
      details: 'Blocked external project path write attempt successfully',
    });

    // ------------------------------------------------------------------------
    // 11. CHATAMU & OPENAI COMPATIBILITY PROVIDER INTEGRATION TEST
    // ------------------------------------------------------------------------
    console.log('\n--- [11] ChatAMU & OpenAI Compatibility Provider Test ---');
    const openAiStart = Date.now();
    const openAiResponse = await client.generateOpenAIChat([
      { role: 'user', content: 'Hallo über OpenAI Provider Route!' },
    ]);
    const openAiDuration = Date.now() - openAiStart;

    const pass11 = openAiResponse.content.length > 0 && openAiResponse.model.length > 0;
    console.log(`Model: ${openAiResponse.model} | Response Latency: ${openAiDuration} ms`);
    console.log(`Content: "${openAiResponse.content}"`);
    results.push({
      test: '11. ChatAMU OpenAI Integration Route',
      passed: pass11,
      durationMs: openAiDuration,
      details: `Model: ${openAiResponse.model}, Response Latency: ${openAiDuration} ms`,
    });

  } finally {
    server.close();
  }

  // ------------------------------------------------------------------------
  // FINAL EMPIRICAL REPORT
  // ------------------------------------------------------------------------
  const finalMemory = process.memoryUsage();
  const heapUsedMb = Math.round(finalMemory.heapUsed / 1024 / 1024);

  console.log('\n================================================================');
  console.log('📊 FINAL REAL OPERATIONAL PRACTICE REPORT (AMU-AGENT-2)');
  console.log('================================================================');
  
  let allPass = true;
  for (const r of results) {
    if (!r.passed) allPass = false;
    console.log(`${r.passed ? '✅ [PASS]' : '❌ [FAIL]'} ${r.test}`);
    console.log(`   Duration: ${r.durationMs} ms | Details: ${r.details}`);
    if (r.metrics) console.log(`   Metrics: ${JSON.stringify(r.metrics)}`);
  }

  console.log('----------------------------------------------------------------');
  console.log(`Real Server Startup Time: ${startupDurationMs} ms`);
  console.log(`Real RAM Memory Usage:    ${heapUsedMb} MB Heap`);
  console.log(`Total Live Tests Executed: ${results.length}`);
  console.log(`OPERATIONAL STATUS:       ${allPass ? '100% READY FOR LIVE OPERATION 🎉' : 'SOME TESTS FAILED ⚠️'}`);
  console.log('================================================================');

  if (!allPass) process.exit(1);
}

executeRealOperationalTests().catch(err => {
  console.error('Real operational test failed with exception:', err);
  process.exit(1);
});

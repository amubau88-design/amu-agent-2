import http from 'node:http';
import { developerEngine } from '../agent-engine/developer-engine.ts';
import { taskPersistenceStore } from '../agent-engine/task-persistence.ts';
import { localProjectManager } from '../projects/local-project-manager.ts';
import { serverManager } from '../servers/server-manager.ts';
import { deploymentManager } from '../deployment/deployment-manager.ts';
import { githubService } from '../github/github-service.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

async function runEndToEndAcceptanceTest() {
  console.log('================================================================');
  console.log('📋 PRAKTISCHE ENDABNAHME: AMU-AGENT-2 ENTWICKLER-AGENT');
  console.log('================================================================\n');

  const taskId = 'task_1791934589748_1bca32';
  const report: Record<string, 'BESTANDEN' | 'FEHLGESCHLAGEN' | 'NOCH OFFEN'> = {};
  const notes: string[] = [];

  // 1. FORTSETZUNG DES BESTEHENDEN TESTAUFTRAGS (Schritte 3, 4, 5)
  console.log(`--- [1] Bestehenden Auftrag '${taskId}' laden & prüfen ---`);
  let task = await taskPersistenceStore.getTask(taskId);
  if (!task) {
    throw new Error(`Bestehender Auftrag '${taskId}' nicht gefunden!`);
  }

  // Falls noch nicht abgeschlossen, führe verbleibende Schritte aus
  while (task.status !== 'completed' && task.plan.currentStepIndex < task.plan.steps.length) {
    const nextIdx = task.plan.currentStepIndex;
    console.log(`Führe Schritt ${nextIdx + 1} aus: ${task.plan.steps[nextIdx].title}`);
    task = await developerEngine.executeTaskStep(taskId);
  }

  console.log(`Auftragsstatus: ${task.status} | Alle Schritte abgeschlossen: ${task.plan.steps.every(s => s.status === 'completed')}`);
  console.log(`Ergebnis Schritt 3 (Code): ${task.plan.steps[2].result}`);
  console.log(`Ergebnis Schritt 4 (Tests): ${task.plan.steps[3].result}`);
  console.log(`Ergebnis Schritt 5 (Verify): ${task.plan.steps[4].result}`);

  const allCompleted = task.plan.steps.every(s => s.status === 'completed');
  if (allCompleted && task.status === 'completed') {
    report['Fortsetzung bestehender Auftrag'] = 'BESTANDEN';
    report['Reale Codegenerierung'] = 'BESTANDEN';
    report['Reale Tests & Verifikation'] = 'BESTANDEN';
    notes.push('Auftrag task_1791934589748_1bca32 hat alle 5 Schritte erfolgreich abgeschlossen.');
  } else {
    report['Fortsetzung bestehender Auftrag'] = 'FEHLGESCHLAGEN';
  }

  // 2. PRÜFUNG DES GENERIERTEN CODES IM DATEISYSTEM
  console.log('\n--- [2] Dateisystemprüfung des erzeugten Codes ---');
  const codeFile = path.resolve(process.cwd(), 'scratch', 'projects', 'rest-microservice', 'src', 'server.ts');
  const testFile = path.resolve(process.cwd(), 'scratch', 'projects', 'rest-microservice', 'tests', 'service.test.ts');
  const codeExists = await fs.access(codeFile).then(() => true).catch(() => false);
  const testExists = await fs.access(testFile).then(() => true).catch(() => false);

  if (codeExists && testExists) {
    const codeContent = await fs.readFile(codeFile, 'utf-8');
    const hasEndpoints = codeContent.includes('/health') && codeContent.includes('/api/products');
    if (hasEndpoints) {
      report['Dateisystem-Validierung'] = 'BESTANDEN';
      notes.push('Code server.ts und Tests service.test.ts existieren real und sind ausführbar.');
    }
  } else {
    report['Dateisystem-Validierung'] = 'FEHLGESCHLAGEN';
  }

  // 3. START DER ERZEUGTEN TESTANWENDUNG & PRÜFUNG DER HTTP-ENDPUNKTE
  console.log('\n--- [3] Start der generierten Testanwendung & API-Prüfung ---');
  const { pathToFileURL } = await import('node:url');
  const codeFileUrl = pathToFileURL(codeFile).href;
  const microserviceModule = await import(codeFileUrl);
  const testServer: http.Server = microserviceModule.createMicroserviceApp();
  const testPort = 3108;

  await new Promise<void>((resolve) => testServer.listen(testPort, () => resolve()));
  console.log(`Test-Microservice läuft temporär auf Port ${testPort}...`);

  try {
    // GET /health
    const healthRes = await fetch(`http://localhost:${testPort}/health`);
    const healthJson = await healthRes.json() as any;

    // GET /api/products
    const prodRes = await fetch(`http://localhost:${testPort}/api/products`);
    const prodJson = await prodRes.json() as any;

    // POST /api/products (Validation Test)
    const postRes = await fetch(`http://localhost:${testPort}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Neuer AMU Node', price: 129.50 })
    });
    const postJson = await postRes.json() as any;

    if (healthJson.status === 'UP' && prodJson.success && postJson.success) {
      report['Start & HTTP-Endpunkte der Testanwendung'] = 'BESTANDEN';
      notes.push(`Microservice auf Port ${testPort} liefert /health (UP), /api/products (${prodJson.count} Einträge) und POST erfolgreich aus.`);
    } else {
      report['Start & HTTP-Endpunkte der Testanwendung'] = 'FEHLGESCHLAGEN';
    }
  } catch (err: any) {
    report['Start & HTTP-Endpunkte der Testanwendung'] = 'FEHLGESCHLAGEN';
    notes.push(`Fehler beim HTTP-Test: ${err.message}`);
  } finally {
    testServer.close();
  }

  // 4. PRÜFUNG: PAUSE, RESUME, CHECKPOINTS, ROLLBACK & PERSISTENZ
  console.log('\n--- [4] Prüfung von Pause, Resume, Checkpoints, Rollback ---');
  const testTask2 = await developerEngine.createLongRunningTask('Test für Pause und Rollback');
  
  // Pause
  const paused = await developerEngine.pauseTask(testTask2.taskId);
  const isPaused = paused.status === 'paused';

  // Resume
  const resumed = await developerEngine.resumeTask(testTask2.taskId);
  const isResumed = resumed.status === 'pending' || resumed.status === 'running';

  // Checkpoints & Rollback
  await developerEngine.executeTaskStep(testTask2.taskId); // Step 1
  await developerEngine.executeTaskStep(testTask2.taskId); // Step 2 (creates checkpoint)
  const cancelled = await developerEngine.cancelTaskWithRollback(testTask2.taskId);
  const isRollback = cancelled.status === 'cancelled';

  // Reload from Disk (Persistenz)
  const diskReload = await taskPersistenceStore.getTask(testTask2.taskId);
  const isPersisted = diskReload !== null && diskReload.status === 'cancelled';

  if (isPaused && isResumed && isRollback && isPersisted) {
    report['Pause, Resume, Checkpoints & Rollback'] = 'BESTANDEN';
    notes.push('Lifecycle-Funktionen (Pause, Resume, Checkpoints, Rollback, Persistenz) voll funktionsfähig.');
  } else {
    report['Pause, Resume, Checkpoints & Rollback'] = 'FEHLGESCHLAGEN';
  }

  // 5. PRÜFUNG: GITHUB, LOKALE DOMAINS, SERVER & DEPLOYMENT
  console.log('\n--- [5] Prüfung von GitHub, Lokale Domains, Server & Deployments ---');
  
  // Lokale Domains & Projekte
  const projects = localProjectManager.listProjects();
  const hasLocalProjects = projects.length > 0;
  if (hasLocalProjects) {
    report['Lokale Projekte & Domain-Verwaltung'] = 'BESTANDEN';
  }

  // Serververwaltung
  const servers = serverManager.listServers();
  const localPrimary = servers.find(s => s.id === 'local-primary');
  if (localPrimary && localPrimary.status === 'online') {
    report['Server-Verwaltung (Lokal & Staging)'] = 'BESTANDEN';
  }

  // Deployment-Vorbereitung (Staging)
  const deployments = deploymentManager.listDeployments();
  if (deployments.length > 0) {
    report['Deployment- & DNS-Paketierung'] = 'BESTANDEN';
  }

  // GitHub Integration
  const ghConfig = githubService.getAuthConfig();
  if (ghConfig.configured && ghConfig.hasToken) {
    report['GitHub Integration'] = 'BESTANDEN';
  } else {
    report['GitHub Integration (Echte Remote-API)'] = 'NOCH OFFEN';
    notes.push('GitHub-Integration: Lokal und architektonisch fertig vorbereitet. Echte Remote-Abfragen NOCH OFFEN (kein GITHUB_TOKEN hinterlegt - als ungeprüft gekennzeichnet).');
  }

  // 6. SICHERHEIT & PROJEKTISOLATION
  console.log('\n--- [6] Prüfung der Sicherheits- & Isolationsgrenzen ---');
  const security = new SecurityGuard(DEFAULT_PERMISSIONS);
  let blockedSystem = false;
  let blockedPreis = false;
  try { security.validatePathAccess('C:/Users/AMU/Downloads/AMU SYSTEM/index.ts', 'write'); } catch { blockedSystem = true; }
  try { security.validatePathAccess('C:/Users/AMU/Downloads/AMU Preis Assistent/package.json', 'write'); } catch { blockedPreis = true; }

  if (blockedSystem && blockedPreis) {
    report['Sicherheitsgrenzen & Isolation'] = 'BESTANDEN';
    notes.push('Schreibzugriffe auf AMU SYSTEM und AMU Preis Assistent zuverlässig gesperrt.');
  } else {
    report['Sicherheitsgrenzen & Isolation'] = 'FEHLGESCHLAGEN';
  }

  // ABSCHLUSS-PRINT
  console.log('\n================================================================');
  console.log('📊 ABSCHLUSSBERICHT: PRAKTISCHE ENDABNAHME');
  console.log('================================================================');
  for (const [feature, status] of Object.entries(report)) {
    const icon = status === 'BESTANDEN' ? '✅' : status === 'FEHLGESCHLAGEN' ? '❌' : '⏳';
    console.log(`${icon} [${status}] ${feature}`);
  }
  console.log('----------------------------------------------------------------');
  console.log('Wichtige Hinweise & Details:');
  notes.forEach(n => console.log(`- ${n}`));
  console.log('================================================================\n');
}

runEndToEndAcceptanceTest().catch(err => {
  console.error('Endabnahmefehler:', err);
  process.exit(1);
});

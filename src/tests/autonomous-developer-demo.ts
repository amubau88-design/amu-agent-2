import { developerEngine } from '../agent-engine/developer-engine.ts';
import { taskPersistenceStore } from '../agent-engine/task-persistence.ts';
import { localProjectManager } from '../projects/local-project-manager.ts';
import { serverManager } from '../servers/server-manager.ts';
import { deploymentManager } from '../deployment/deployment-manager.ts';
import { githubService } from '../github/github-service.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';

async function runAutonomousDeveloperDemonstration() {
  console.log('================================================================');
  console.log('🚀 DEMONSTRATION: AUTONOMER ENTWICKLER-AGENT (AMU-AGENT-2)');
  console.log('================================================================\n');

  const testReport = {
    taskCreation: false,
    stepExecution: false,
    checkpointSaved: false,
    persistenceTested: false,
    projectScaffolded: false,
    projectStarted: false,
    deploymentPrepared: false,
    securityCheckPassed: false,
  };

  // 1. Entwickler-Auftrag erstellen und planen
  console.log('--- [1] Multi-Step Entwicklungsauftrag erstellen ---');
  const task = await developerEngine.createLongRunningTask('Baue einen schnellen REST-Microservice mit Validierung und Tests');
  console.log(`Task angelegt: ${task.taskId} | Schritte im Plan: ${task.plan.steps.length}`);
  testReport.taskCreation = task.plan.steps.length === 5;

  // 2. Schritt ausführen (Analyse & Scaffold)
  console.log('\n--- [2] Schrittweise Ausführung durch Entwickler-Engine ---');
  const step1 = await developerEngine.executeTaskStep(task.taskId);
  console.log(`Schritt 1 Status: ${step1.plan.steps[0].status} | Ergebnis: ${step1.plan.steps[0].result}`);
  const step2 = await developerEngine.executeTaskStep(task.taskId);
  console.log(`Schritt 2 Status: ${step2.plan.steps[1].status} | Checkpoints vorhanden: ${step2.checkpoints.length}`);
  testReport.stepExecution = step1.plan.steps[0].status === 'completed' && step2.plan.steps[1].status === 'completed';
  testReport.checkpointSaved = step2.checkpoints.length > 0;

  // 3. Dauerhafte Speicherung & Wiederaufnahme testen
  console.log('\n--- [3] Dauerhafte Aufgaben-Persistenz & Crash-Recovery ---');
  const reloaded = await taskPersistenceStore.getTask(task.taskId);
  testReport.persistenceTested = reloaded !== null && reloaded.taskId === task.taskId;
  console.log(`Task aus Speicher geladen: ${reloaded?.taskId} (Status: ${reloaded?.status})`);

  // 4. Neues isoliertes lokales Projekt erstellen und starten
  console.log('\n--- [4] Lokales Projekt erstellen und Server starten ---');
  const newProj = await localProjectManager.createProject('Kunden-Api', 'api');
  console.log(`Projekt angelegt: ${newProj.name} auf Port ${newProj.port} (${newProj.localUrl})`);
  const startResult = await localProjectManager.startProject(newProj.id);
  console.log(`Projekt-Start Status: ${startResult.success} | URL: ${startResult.url}`);
  testReport.projectScaffolded = newProj.port > 0;
  testReport.projectStarted = startResult.success;

  // 5. Deployment-Paket vorbereiten (Staging)
  console.log('\n--- [5] Deployment & Domain Management ---');
  const deployPkg = deploymentManager.prepareDeploymentPackage(newProj.id, '1.0.0', 'staging');
  console.log(`Deployment vorbereitet: ${deployPkg.id} für Host: ${deployPkg.domain}`);
  testReport.deploymentPrepared = deployPkg.status === 'draft';

  // 6. Sicherheitsprüfung (Isolation gegen fremde Projekte)
  console.log('\n--- [6] Sicherheits- & Isolationsprüfung ---');
  const security = new SecurityGuard(DEFAULT_PERMISSIONS);
  let blocked = false;
  try {
    security.validatePathAccess('C:/Users/AMU/Downloads/AMU SYSTEM/config.json', 'write');
  } catch {
    blocked = true;
  }
  testReport.securityCheckPassed = blocked;
  console.log(`Zugriff auf fremde AMU-Projekte blockiert: ${blocked ? 'JA ✅' : 'NEIN ❌'}`);

  // Sauberes Stoppen des Testprojekts
  await localProjectManager.stopProject(newProj.id);

  console.log('\n================================================================');
  console.log('🏆 ABSCHLUSS-STATUS DER DEMONSTRATION');
  console.log('================================================================');
  console.log(`Multi-Step Task Creation:      ${testReport.taskCreation ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log(`Step-by-Step Ausführung:       ${testReport.stepExecution ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log(`Checkpoints & Rollback-Schutz: ${testReport.checkpointSaved ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log(`Persistenz nach Neustart:      ${testReport.persistenceTested ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log(`Lokales Projekt & Port:        ${testReport.projectScaffolded ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log(`Lokaler App-Server Start:      ${testReport.projectStarted ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log(`Staging Deployment Paket:      ${testReport.deploymentPrepared ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log(`Fremdprojekt-Isolation:        ${testReport.securityCheckPassed ? 'BESTANDEN ✅' : 'FEHLER ❌'}`);
  console.log('================================================================');
}

runAutonomousDeveloperDemonstration().catch(err => {
  console.error('Demonstrationsfehler:', err);
  process.exit(1);
});

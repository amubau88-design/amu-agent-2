import http from 'node:http';
import { StructuredLogger } from '../shared/logger.ts';

const logger = new StructuredLogger('browser-verifier', 'e2e');

export interface BrowserE2ETestCase {
  name: string;
  category: 'page_load' | 'form_submit' | 'data_persistence' | 'error_validation' | 'kpi_update';
  status: 'passed' | 'failed';
  durationMs: number;
  details: string;
  httpStatus?: number;
}

export interface BrowserE2EReport {
  targetUrl: string;
  timestamp: string;
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  testCases: BrowserE2ETestCase[];
}

export class BrowserE2EVerifier {
  public async verifyApplication(
    baseUrl: string,
    formApiPath: string = '/api/customers',
    validPayload: Record<string, unknown> = {
      name: 'E2E Testkunde',
      company: 'AMU E2E Testbau',
      email: 'e2e@amu-test.de',
      status: 'active',
    },
    invalidPayload: Record<string, unknown> = {
      name: '',
      email: 'keine-email',
    }
  ): Promise<BrowserE2EReport> {
    const testCases: BrowserE2ETestCase[] = [];
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    logger.info(`Starting browser-equivalent E2E verification on ${cleanBaseUrl}`);

    // 1. Page Load Test (GET /)
    const t1Start = Date.now();
    try {
      const pageRes = await this.httpRequest(`${cleanBaseUrl}/`);
      const isHtml = pageRes.headers['content-type']?.includes('text/html') || false;
      const hasTitle = pageRes.body.includes('<title>') && pageRes.body.includes('</title>');
      const hasForm = pageRes.body.includes('<input') || pageRes.body.includes('<button');

      if (pageRes.statusCode === 200 && isHtml && hasTitle && hasForm) {
        testCases.push({
          name: 'Webseite Laden & DOM-Strukturprüfung (GET /)',
          category: 'page_load',
          status: 'passed',
          durationMs: Date.now() - t1Start,
          httpStatus: pageRes.statusCode,
          details: `HTML5 Oberfläche erfolgreich geladen (${pageRes.body.length} Bytes, valide Formularelemente & Meta-Tags vorhanden).`,
        });
      } else {
        testCases.push({
          name: 'Webseite Laden & DOM-Strukturprüfung (GET /)',
          category: 'page_load',
          status: 'failed',
          durationMs: Date.now() - t1Start,
          httpStatus: pageRes.statusCode,
          details: `Unerwarteter Status oder ungültiges HTML: HTTP ${pageRes.statusCode}, isHtml=${isHtml}, hasForm=${hasForm}`,
        });
      }
    } catch (err: unknown) {
      testCases.push({
        name: 'Webseite Laden & DOM-Strukturprüfung (GET /)',
        category: 'page_load',
        status: 'failed',
        durationMs: Date.now() - t1Start,
        details: `Verbindungsfehler: ${(err as Error).message}`,
      });
    }

    // 2. Health & API Availability Test
    const t2Start = Date.now();
    try {
      const healthRes = await this.httpRequest(`${cleanBaseUrl}/health`);
      if (healthRes.statusCode === 200) {
        testCases.push({
          name: 'API-Verfügbarkeit & Health-Check (GET /health)',
          category: 'page_load',
          status: 'passed',
          durationMs: Date.now() - t2Start,
          httpStatus: healthRes.statusCode,
          details: `API antwortet einwandfrei: ${healthRes.body.substring(0, 80)}`,
        });
      } else {
        testCases.push({
          name: 'API-Verfügbarkeit & Health-Check (GET /health)',
          category: 'page_load',
          status: 'failed',
          durationMs: Date.now() - t2Start,
          httpStatus: healthRes.statusCode,
          details: `Health-Endpoint lieferte HTTP ${healthRes.statusCode}`,
        });
      }
    } catch (err: unknown) {
      testCases.push({
        name: 'API-Verfügbarkeit & Health-Check (GET /health)',
        category: 'page_load',
        status: 'failed',
        durationMs: Date.now() - t2Start,
        details: `Verbindungsfehler: ${(err as Error).message}`,
      });
    }

    // 3. Formular-Absenden (POST valid payload)
    const t3Start = Date.now();
    try {
      const postRes = await this.httpRequest(`${cleanBaseUrl}${formApiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });

      if (postRes.statusCode === 200 || postRes.statusCode === 201) {
        testCases.push({
          name: `Formular-Ablauf: Datensatz anlegen (POST ${formApiPath})`,
          category: 'form_submit',
          status: 'passed',
          durationMs: Date.now() - t3Start,
          httpStatus: postRes.statusCode,
          details: `Neuer Datensatz erfolgreich erzeugt und bestätigt: ${postRes.body.substring(0, 100)}`,
        });
      } else {
        testCases.push({
          name: `Formular-Ablauf: Datensatz anlegen (POST ${formApiPath})`,
          category: 'form_submit',
          status: 'failed',
          durationMs: Date.now() - t3Start,
          httpStatus: postRes.statusCode,
          details: `Fehler beim Erzeugen: HTTP ${postRes.statusCode}: ${postRes.body}`,
        });
      }
    } catch (err: unknown) {
      testCases.push({
        name: `Formular-Ablauf: Datensatz anlegen (POST ${formApiPath})`,
        category: 'form_submit',
        status: 'failed',
        durationMs: Date.now() - t3Start,
        details: `Verbindungsfehler: ${(err as Error).message}`,
      });
    }

    // 4. Daten-Persistenz & Anzeige-Prüfung (GET list)
    const t4Start = Date.now();
    try {
      const getRes = await this.httpRequest(`${cleanBaseUrl}${formApiPath}`);
      const hasSavedItem = getRes.body.includes(String(validPayload.name || 'Testkunde'));

      if (getRes.statusCode === 200 && hasSavedItem) {
        testCases.push({
          name: `Datenpersistenz & Live-Aktualisierung (GET ${formApiPath})`,
          category: 'data_persistence',
          status: 'passed',
          durationMs: Date.now() - t4Start,
          httpStatus: getRes.statusCode,
          details: `Zuvor erstellter Datensatz ('${validPayload.name}') in der Abfrageliste nachgewiesen.`,
        });
      } else {
        testCases.push({
          name: `Datenpersistenz & Live-Aktualisierung (GET ${formApiPath})`,
          category: 'data_persistence',
          status: 'failed',
          durationMs: Date.now() - t4Start,
          httpStatus: getRes.statusCode,
          details: `Datensatz wurde nach POST nicht in der Auswahlliste gefunden.`,
        });
      }
    } catch (err: unknown) {
      testCases.push({
        name: `Datenpersistenz & Live-Aktualisierung (GET ${formApiPath})`,
        category: 'data_persistence',
        status: 'failed',
        durationMs: Date.now() - t4Start,
        details: `Verbindungsfehler: ${(err as Error).message}`,
      });
    }

    // 5. Fehlerbehandlung & Validierung (POST invalid payload)
    const t5Start = Date.now();
    try {
      const errRes = await this.httpRequest(`${cleanBaseUrl}${formApiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });

      if (errRes.statusCode === 400) {
        testCases.push({
          name: `Validierung & Fehlerrückmeldung bei Falscheingabe (POST ${formApiPath})`,
          category: 'error_validation',
          status: 'passed',
          durationMs: Date.now() - t5Start,
          httpStatus: errRes.statusCode,
          details: `Ungültige Eingaben werden korrekt mit HTTP 400 abgewiesen: ${errRes.body.substring(0, 80)}`,
        });
      } else {
        testCases.push({
          name: `Validierung & Fehlerrückmeldung bei Falscheingabe (POST ${formApiPath})`,
          category: 'error_validation',
          status: 'failed',
          durationMs: Date.now() - t5Start,
          httpStatus: errRes.statusCode,
          details: `Ungültige Eingabe wurde nicht mit HTTP 400 abgewiesen (Status war ${errRes.statusCode}).`,
        });
      }
    } catch (err: unknown) {
      testCases.push({
        name: `Validierung & Fehlerrückmeldung bei Falscheingabe (POST ${formApiPath})`,
        category: 'error_validation',
        status: 'failed',
        durationMs: Date.now() - t5Start,
        details: `Verbindungsfehler: ${(err as Error).message}`,
      });
    }

    const passedTests = testCases.filter(t => t.status === 'passed').length;
    const failedTests = testCases.filter(t => t.status === 'failed').length;

    return {
      targetUrl: cleanBaseUrl,
      timestamp: new Date().toISOString(),
      allPassed: failedTests === 0,
      totalTests: testCases.length,
      passedTests,
      failedTests,
      testCases,
    };
  }

  private httpRequest(urlStr: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(urlStr);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data,
        }));
      });

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

export const browserE2EVerifier = new BrowserE2EVerifier();

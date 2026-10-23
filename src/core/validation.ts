import ts from 'typescript';
export function checkSource(filename: string, content: string): { passed: boolean; details: string } {
  if (filename.endsWith('.json')) { try { JSON.parse(content); return { passed: true, details: 'Valid JSON' }; } catch (e) { return { passed: false, details: (e as Error).message }; } }
  if (/\.[cm]?[jt]sx?$/.test(filename)) {
    const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : filename.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS);
    const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    return { passed: !diagnostics.length, details: diagnostics.length ? diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n') : 'Syntax parsed without executing code' };
  }
  if (filename.endsWith('.md') || filename.endsWith('.txt')) return { passed: true, details: 'Text document; no executable syntax' };
  return { passed: false, details: 'Unsupported file type for controlled changes' };
}

import ts from 'typescript';import path from 'node:path';
/** Read literal assertions from declared reference files; never execute or synthesize implementations. */
export function contractExamples(target:string,sources:{path:string;content:string|null}[],protectedFiles:string[]=[]){
 const examples:{file:string;call:string;expected:string}[]=[];
 const literal=(n:ts.Expression):boolean=>ts.isNumericLiteral(n)||ts.isStringLiteral(n)||n.kind===ts.SyntaxKind.TrueKeyword||n.kind===ts.SyntaxKind.FalseKeyword||ts.isPrefixUnaryExpression(n)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(n.operator)&&ts.isNumericLiteral(n.operand);
 for(const source of sources){if(!source.content||!protectedFiles.includes(source.path))continue;const tree=ts.createSourceFile(source.path,source.content,ts.ScriptTarget.Latest,true),bindings=new Set<string>();for(const node of tree.statements){if(!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||path.posix.normalize(path.posix.join(path.posix.dirname(source.path),node.moduleSpecifier.text))!==target)continue;const named=node.importClause?.namedBindings;if(named&&ts.isNamedImports(named))for(const binding of named.elements)bindings.add(binding.name.text);}
 function visit(node:ts.Node){if(examples.length>=8)return;if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='equal'&&node.arguments.length===2){const [actual,expected]=node.arguments;if(ts.isCallExpression(actual)&&ts.isIdentifier(actual.expression)&&bindings.has(actual.expression.text)&&actual.arguments.every(literal)&&literal(expected))examples.push({file:source.path,call:actual.getText(tree),expected:expected.getText(tree)});}ts.forEachChild(node,visit);}visit(tree);}
 return examples;
}

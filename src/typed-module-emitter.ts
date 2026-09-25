import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";

const inside = (root: string, file: string): boolean => {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const sourcesIn = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`typed module source cannot be a symlink: ${absolute}`);
    if (entry.isDirectory()) files.push(...await sourcesIn(absolute));
    else if (entry.name.endsWith(".mts")) files.push(absolute);
    else throw new Error(`typed module source must be .mts: ${absolute}`);
  }
  return files.sort();
};

/** Emit an isolated ESM package from typed .mts sources without writing .mjs, even temporarily. */
export const emitTypedModules = async (sourceDirectory: string, outputDirectory: string): Promise<string[]> => {
  const sourceRoot = path.resolve(sourceDirectory);
  const outputRoot = path.resolve(outputDirectory);
  if (sourceRoot === outputRoot || inside(sourceRoot, outputRoot) || inside(outputRoot, sourceRoot)) {
    throw new Error("typed module source and output directories must not overlap");
  }
  if (await stat(outputRoot).then(() => true, () => false)) {
    throw new Error(`typed module output already exists: ${outputRoot}`);
  }
  const files = await sourcesIn(sourceRoot);
  if (files.length === 0) throw new Error("typed module source directory contains no .mts files");
  const fileSet = new Set(files);

  const rewrite = (source: ts.SourceFile): ts.TransformerFactory<ts.SourceFile> => (context) => {
    const specifier = (literal: ts.StringLiteral): ts.StringLiteral => {
      const value = literal.text;
      if (value.startsWith("node:")) return literal;
      if (!value.startsWith("./") && !value.startsWith("../")) {
        throw new Error(`unsupported module specifier in ${source.fileName}: ${value}`);
      }
      if (!/^\.\.?\/(?:[^?#\\\0]+\/)*[^/?#\\\0]+\.mjs$/u.test(value)) {
        throw new Error(`unsafe relative module specifier in ${source.fileName}: ${value}`);
      }
      const target = path.resolve(path.dirname(source.fileName), value.slice(0, -4) + ".mts");
      if (!inside(sourceRoot, target) || !fileSet.has(target)) {
        throw new Error(`unresolved relative module specifier in ${source.fileName}: ${value}`);
      }
      return ts.factory.createStringLiteral(value.slice(0, -4) + ".js");
    };
    const visit = (node: ts.Node): ts.Node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, specifier(node.moduleSpecifier), node.attributes);
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        return ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, specifier(node.moduleSpecifier), node.attributes);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) {
          throw new Error(`dynamic import must use a string literal in ${source.fileName}`);
        }
        return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [specifier(node.arguments[0])]);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (file) => ts.visitNode(file, visit) as ts.SourceFile;
  };

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    rootDir: sourceRoot,
    outDir: outputRoot,
    strict: true,
    skipLibCheck: true,
    noEmitOnError: true,
    types: ["node"],
  };
  const program = ts.createProgram(files, options);
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`typed module source is missing: ${file}`);
    const checked = ts.transform(source, [rewrite(source)]);
    checked.dispose();
  }
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => sourceRoot,
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n",
    }));
  }

  const emitted = new Map<string, string>();
  const result = program.emit(undefined, (file, text) => {
    if (!file.endsWith(".mjs")) throw new Error(`unexpected typed module output: ${file}`);
    const destination = path.resolve(file.slice(0, -4) + ".js");
    if (!inside(outputRoot, destination) || emitted.has(destination)) {
      throw new Error(`invalid typed module output: ${file}`);
    }
    emitted.set(destination, text);
  }, undefined, undefined, { before: [(context) => (file) => rewrite(file)(context)(file)] });
  if (result.emitSkipped || result.diagnostics.length > 0 || emitted.size !== files.length) {
    throw new Error("typed module compilation did not emit every source");
  }
  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, "package.json"), '{"type":"module"}\n');
  for (const [file, text] of [...emitted].sort(([a], [b]) => a.localeCompare(b))) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return [...emitted.keys()].sort();
};

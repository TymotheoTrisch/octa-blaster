import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const path = resolve(projectRoot, specifier.slice(2));
      const target = existsSync(path) ? path : `${path}.ts`;
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL) {
      const target = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(target))) return { url: target.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const result = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      });
      return { format: 'module', source: result.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

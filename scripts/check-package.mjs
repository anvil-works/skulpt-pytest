// Exercise the shipped ESM package and Sk property layout, independently of Rstest transforms.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { installPytest, runTests } from '../dist/index.js';

const directory = resolve(process.env.SKULPT_DIST ?? '../skulpt/dist');
const consumer = resolve('.scratch/package-consumer.ts');
const source = "import { runTests } from '@anvil-works/skulpt-pytest'; const result: Promise<{exitCode: number}> = runTests(null as never, {files: {}});";
const options = { strict: true, noEmit: true, skipLibCheck: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022 };
const host = ts.createCompilerHost(options);
const original = host.getSourceFile.bind(host);
host.getSourceFile = (name, ...args) => name === consumer ? ts.createSourceFile(name, source, options.target, true) : original(name, ...args);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([consumer], options, host));
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => process.cwd(), getCanonicalFileName: name => name, getNewLine: () => '\n',
}));
for (const core of [process.env.SKULPT_CORE ?? 'skulpt.min.js']) {
  assert.ok(readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8').includes('runTests'));
  const context = vm.createContext({ console, setTimeout, clearTimeout, TextEncoder, TextDecoder });
  vm.runInContext(readFileSync(join(directory, core), 'utf8'), context);
  vm.runInContext(readFileSync(join(directory, 'skulpt-stdlib.js'), 'utf8'), context);
  const Sk = context.Sk;
  const fast = () => assert.equal(vm.runInContext('%HasFastProperties(Sk)', context), true, core);
  const read = path => {
    const part = Sk.builtinFiles.files[path];
    if (typeof part === 'number') {
      Object.assign(Sk.builtinFiles.files, JSON.parse(readFileSync(join(directory, `skulpt-stdlib-${part}.json`), 'utf8')));
    }
    const source = Sk.builtinFiles.files[path];
    if (source === undefined) throw new Error(`Source unavailable: ${path}`);
    return source;
  };
  fast();
  Sk.configure({ __future__: Sk.python3, read, output: () => {} });
  fast();
  installPytest(Sk);
  fast();
  const result = await runTests(Sk, { files: { 'test_package.py': 'import pytest\ndef test_package():\n    with pytest.raises(ValueError):\n        int("bad")\n' } });
  assert.equal(result.exitCode, 0);
  fast();
  Sk.configure({ __future__: Sk.python2 });
  await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('python2', false, 'print 1\n', true));
  fast();
  Sk.configure({ __future__: Sk.python3 });
  await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('python3', false, 'assert 1 == 1\n', true));
  fast();
  console.log(`${core}: package import/run and fast properties passed`);
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { runtimeDist } from "../scripts/runtime-path";

const core = readFileSync(join(runtimeDist, "skulpt.min.js"), "utf8");
const stdlib = readFileSync(join(runtimeDist, "skulpt-stdlib.js"), "utf8");

export function runtime() {
  const context = vm.createContext({ console, setTimeout, clearTimeout, TextEncoder, TextDecoder });
  vm.runInContext(core, context);
  vm.runInContext(stdlib, context);
  // The untyped interpreter bundle is the external boundary of these tests.
  const Sk = context.Sk as any;
  const output: string[] = [];
  Sk.configure({
    __future__: Sk.python3,
    output: (text: string) => output.push(text),
    read(path: string) {
      const part = Sk.builtinFiles.files[path];
      if (typeof part === "number") {
        Object.assign(Sk.builtinFiles.files, JSON.parse(readFileSync(join(runtimeDist, `skulpt-stdlib-${part}.json`), "utf8")));
      }
      const source = Sk.builtinFiles.files[path];
      if (source === undefined) throw new Error(`Source unavailable: ${path}`);
      return source;
    },
  });
  return { Sk, output };
}

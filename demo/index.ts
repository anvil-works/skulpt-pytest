import { runTests } from "../src/index";
import source from "./test_browser.py?raw";
import upstreamRaises from "../tests/upstream/raises.py?raw";
import agentStyle from "./test_agent_style.py?raw";

declare global {
  interface Window { Sk: any; pytestDemo?: Awaited<ReturnType<typeof runTests>> }
}
const Sk = window.Sk;
const output = document.querySelector<HTMLPreElement>("#output")!;
const status = document.querySelector<HTMLPreElement>("#result")!;
Sk.configure({
  __future__: Sk.python3,
  output: (text: string) => { output.textContent += text; },
  read(path: string) {
    const source = Sk.builtinFiles.files[path];
    if (typeof source === "number") {
      return Sk.misceval.promiseToSuspension(fetch(`/skulpt/skulpt-stdlib-${source}.json`)
        .then(response => {
          if (!response.ok) throw new Error(`Source chunk failed: ${response.status}`);
          return response.json();
        }).then(files => {
          Object.assign(Sk.builtinFiles.files, files);
          return files[path];
        }));
    }
    if (source === undefined) throw new Error(`Source unavailable: ${path}`);
    return source;
  },
});
Sk.builtins.pause = new Sk.builtin.func(() => Sk.misceval.promiseToSuspension(
  new Promise(resolve => setTimeout(() => resolve(Sk.builtin.none.none$), 5))));

runTests(Sk, { files: {
  "tests/client_tests/test_browser.py": source,
  "tests/client_tests/test_upstream_raises.py": upstreamRaises,
  "tests/client_tests/test_agent_style.py": agentStyle,
} }).then(result => {
  window.pytestDemo = result;
  status.textContent = JSON.stringify(result.events.at(-1), null, 2);
}).catch(error => { status.textContent = String(error); });

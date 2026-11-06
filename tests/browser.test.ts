import { expect, test } from "@rstest/core";
import { createRsbuild } from "@rsbuild/core";
import { chromium } from "playwright";
import config from "../rsbuild.config";

test("runs the built-in pytest module and upstream cases in a real browser", async () => {
  const rsbuild = await createRsbuild({ rsbuildConfig: { ...config, server: { ...config.server, port: 0 } } });
  const server = await rsbuild.startDevServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(server.urls[0]);
    await page.waitForFunction(() => window.pytestDemo !== undefined);
    const result = await page.evaluate(() => window.pytestDemo!);
    expect(errors).toEqual([]);
    expect(result.exitCode).toBe(1);
    expect(result.events.at(-1)).toMatchObject({ status: "complete", counts: { passed: 12, failed: 1, error: 0, skipped: 1, xfailed: 1, xpassed: 0 },
      collection_skips: [{ file_path: "tests/client_tests/test_optional.py", reason: "demonstrate optional module" }] });
    const failed = result.events.flatMap(event => event.type === "test_updates" ? event.tests : [])
      .find(test => test.result.outcome === "failed")!;
    expect(failed.result.errors![0].traceback).toContain("assert resource == 42");
    expect(await page.locator("#output").textContent()).toBe("uncaptured browser output\nbrowser fixture cleaned up\nbrowser fixture cleaned up\n");
  } finally {
    await browser.close();
    await server.server.close();
  }
}, 60000);

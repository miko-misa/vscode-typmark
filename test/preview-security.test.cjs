const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const compiledPreview = path.join(root, "out/preview.js");
const source = fs.readFileSync(compiledPreview, "utf8");

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { injectPreviewScript } = require(compiledPreview);
Module._load = originalLoad;

test("preview requests sanitized TypMark output", () => {
  assert.match(source, /["']--sanitized["']/);
});

test("preview permits only nonce-bearing scripts", () => {
  const html = [
    "<html><head><script>trustedRenderer()</script></head>",
    "<body><p>Preview</p></body></html>",
  ].join("");
  const result = injectPreviewScript(html, "test-nonce");

  assert.match(result, /Content-Security-Policy/);
  assert.match(result, /script-src 'nonce-test-nonce'/);
  const scripts = result.match(/<script\b[^>]*>/g) ?? [];
  assert.equal(scripts.length, 2);
  assert.ok(
    scripts.every((script) => script.includes('nonce="test-nonce"')),
  );
});

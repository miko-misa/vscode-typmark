const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const grammar = JSON.parse(
  fs.readFileSync(path.join(root, "syntaxes/typmark.tmLanguage.json"), "utf8"),
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

function closingPattern(fence, opener) {
  const escaped = opener.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(fence.end.replace("\\1", escaped));
}

test("Typst fences use the embedded Typst grammar before generic fences", () => {
  const includes = grammar.repository.block.patterns.map(
    (pattern) => pattern.include,
  );
  assert.ok(includes.indexOf("#fencedTypst") < includes.indexOf("#fencedCode"));

  const backtick = grammar.repository.fencedTypstBacktick;
  const tilde = grammar.repository.fencedTypstTilde;
  assert.match(
    "```typst {render=svg caption=\"A } B\"}",
    new RegExp(backtick.begin),
  );
  assert.match("~~~typst {scope=preamble}", new RegExp(tilde.begin));
  assert.doesNotMatch("```python", new RegExp(backtick.begin));

  for (const fence of [backtick, tilde]) {
    assert.equal(fence.contentName, "meta.embedded.block.typst");
    assert.deepEqual(fence.patterns, [{ include: "source.typst" }]);
  }
});

test("generic fences accept CommonMark info strings", () => {
  const backtick = grammar.repository.fencedCodeBacktick;
  assert.match("```c++", new RegExp(backtick.begin));
  assert.match("```lang {caption=\"A } B\"}", new RegExp(backtick.begin));
});

test("closing fences are at least as long as their opener", () => {
  const fences = [
    [grammar.repository.fencedTypstBacktick, "`"],
    [grammar.repository.fencedTypstTilde, "~"],
    [grammar.repository.fencedCodeBacktick, "`"],
    [grammar.repository.fencedCodeTilde, "~"],
  ];
  for (const [fence, character] of fences) {
    const opener = character.repeat(4);
    const closing = closingPattern(fence, opener);
    assert.doesNotMatch(character.repeat(3), closing);
    assert.match(character.repeat(4), closing);
    assert.match(character.repeat(5), closing);
  }
});

test("extension maps the embedded scope to the Typst language", () => {
  assert.equal(
    manifest.contributes.grammars[0].embeddedLanguages[
      "meta.embedded.block.typst"
    ],
    "typst",
  );
});

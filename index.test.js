const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const {
  VerificationError,
  buildDownloadUrl,
  getExpectedChecksum,
  verifyChecksum,
} = require("./index.js");
const version = require("./version.json").version;
const checksums = require("./checksums.json");

const triple = "x86_64-unknown-linux-gnu";

test("buildDownloadUrl builds the release asset URL", () => {
  const url = buildDownloadUrl(triple, version);
  assert.ok(
    url.startsWith(
      `https://github.com/bitwarden/sm-action/releases/download/v${version}/sm-action-${triple}`,
    ),
  );
});

test("buildDownloadUrl rejects versions that can change the URL", () => {
  const payloads = [
    "1/../../../../../attacker/evil/releases/download/v9.9.9",
    "1/../../../../attacker/evil/releases/download/v9.9.9",
    "1.0.0/../x",
    "1.0.0%2e%2e/x",
    "1.0.0?x=1",
    "1.0.0#x",
    "../../x",
    "",
    "latest",
  ];

  for (const payload of payloads) {
    assert.throws(
      () => buildDownloadUrl(triple, payload),
      VerificationError,
      payload,
    );
  }
});

test("getExpectedChecksum returns the recorded digest for the current version", () => {
  const name = `sm-action-${triple}`;
  assert.strictEqual(
    getExpectedChecksum(version, name),
    checksums.assets[name],
  );
});

test("getExpectedChecksum fails closed on version mismatch or unknown asset", () => {
  assert.throws(
    () => getExpectedChecksum("0.0.0", `sm-action-${triple}`),
    VerificationError,
  );
  assert.throws(
    () => getExpectedChecksum(version, "sm-action-unknown"),
    VerificationError,
  );
});

test("checksums.json matches version.json and covers all six targets", () => {
  assert.strictEqual(checksums.version, version);
  assert.strictEqual(Object.keys(checksums.assets).length, 6);
  for (const digest of Object.values(checksums.assets)) {
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
});

test("verifyChecksum accepts matching content and rejects tampered content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-action-test-"));
  const file = path.join(dir, "bin");
  try {
    fs.writeFileSync(file, "expected contents");
    const digest = crypto
      .createHash("sha256")
      .update("expected contents")
      .digest("hex");

    verifyChecksum(file, digest);

    fs.writeFileSync(file, "tampered contents");
    assert.throws(() => verifyChecksum(file, digest), VerificationError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

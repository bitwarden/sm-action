const { execSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const version = require("./version.json").version;
const checksums = require("./checksums.json");

const repoOwner = "bitwarden";
const repoName = "sm-action";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
// GitHub serves release assets from github.com, redirecting to one of these hosts.
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-releases.githubusercontent.com",
]);

/**
 * Raised when a downloaded binary cannot be trusted. Unlike transport
 * failures, this must never fall back to building from source silently.
 */
class VerificationError extends Error {}

function debug(message) {
  if ("RUNNER_DEBUG" in process.env || "ACTIONS_RUNNER_DEBUG" in process.env) {
    console.log(`::debug::${message}`);
  }
}

function getVersion() {
  if (!SEMVER_PATTERN.test(version)) {
    throw new VerificationError(`Invalid version in version.json: ${version}`);
  }

  console.log(`Using version from version.json: ${version}`);
  return version;
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeUnlink(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Downloads a file from a URL to a local path. Redirects are limited in depth
 * and may only point at GitHub's release asset hosts over https.
 */
function downloadFile(url, outputPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode;

      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          return reject(new VerificationError("Too many redirects"));
        }

        let next;
        try {
          next = new URL(response.headers.location, url);
        } catch {
          return reject(new VerificationError("Invalid redirect location"));
        }
        if (
          next.protocol !== "https:" ||
          !ALLOWED_DOWNLOAD_HOSTS.has(next.hostname)
        ) {
          return reject(
            new VerificationError(`Refusing redirect to ${next.origin}`),
          );
        }

        return downloadFile(next.href, outputPath, redirects + 1)
          .then(resolve)
          .catch(reject);
      }

      if (status !== 200) {
        response.resume();
        return reject(
          new Error(`Failed to download: ${status} ${response.statusMessage}`),
        );
      }

      const file = fs.createWriteStream(outputPath);
      let received = 0;
      const fail = (err) => {
        file.close();
        safeUnlink(outputPath);
        request.destroy();
        reject(err);
      };

      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) {
          fail(new Error("Download exceeds maximum allowed size"));
        }
      });
      response.on("error", fail);
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
      file.on("error", fail);
    });

    request.on("error", (err) => {
      safeUnlink(outputPath);
      reject(err);
    });

    // Set timeout to prevent hanging
    request.setTimeout(30000, () => {
      request.destroy();
      safeUnlink(outputPath);
      reject(new Error("Download timeout"));
    });
  });
}

function getAssetName(targetTriple) {
  return `sm-action-${targetTriple}${
    process.platform === "win32" ? ".exe" : ""
  }`;
}

/**
 * Constructs the GitHub release download URL and checks that it points at this
 * repository's release assets, whatever the inputs.
 */
function buildDownloadUrl(targetTriple, version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new VerificationError(`Invalid version: ${version}`);
  }

  const assetName = getAssetName(targetTriple);
  const expectedPath = `/${repoOwner}/${repoName}/releases/download/v${version}/${assetName}`;
  const url = new URL(`https://github.com${expectedPath}`);

  if (
    url.protocol !== "https:" ||
    url.host !== "github.com" ||
    url.pathname !== expectedPath
  ) {
    throw new VerificationError(`Unexpected download URL: ${url.href}`);
  }

  return url.href;
}

function getExpectedChecksum(version, assetName) {
  if (checksums.version !== version) {
    throw new VerificationError(
      `checksums.json is for version ${checksums.version}, expected ${version}`,
    );
  }

  const expected = checksums.assets && checksums.assets[assetName];
  if (!/^[0-9a-f]{64}$/.test(expected || "")) {
    throw new VerificationError(`No checksum recorded for ${assetName}`);
  }

  return expected;
}

function verifyChecksum(filePath, expected) {
  const actual = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest();

  if (!crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"))) {
    throw new VerificationError(
      `Checksum mismatch: expected ${expected}, got ${actual.toString("hex")}`,
    );
  }
}

/**
 * Downloads the pre-built binary from GitHub Releases and verifies it against
 * checksums.json. Returns false only for transport failures; anything that
 * makes the binary untrustworthy throws.
 */
async function downloadBinary(targetTriple, binaryPath) {
  const version = getVersion();
  const downloadUrl = buildDownloadUrl(targetTriple, version);
  const expected = getExpectedChecksum(version, getAssetName(targetTriple));
  const tempPath = `${binaryPath}.download`;

  console.log(`Attempting to download binary from: ${downloadUrl}`);

  try {
    ensureDirectoryExists(path.dirname(binaryPath));
    await downloadFile(downloadUrl, tempPath);
  } catch (error) {
    safeUnlink(tempPath);
    if (error instanceof VerificationError) {
      throw error;
    }
    console.warn(`Failed to download binary: ${error.message}`);
    return false;
  }

  try {
    verifyChecksum(tempPath, expected);
  } catch (error) {
    safeUnlink(tempPath);
    throw error;
  }

  fs.renameSync(tempPath, binaryPath);
  console.log(`Downloaded and verified binary at: ${binaryPath}`);
  return true;
}

function getArch() {
  const archMap = {
    x64: "x86_64",
    arm64: "aarch64",
  };

  const arch = archMap[process.arch];
  if (arch == null) {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }

  return arch;
}

function getPlatform() {
  const platformMap = {
    linux: "unknown-linux-gnu",
    darwin: "apple-darwin",
    win32: "pc-windows-msvc",
  };

  const platform = platformMap[process.platform];
  if (platform == null) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  return platform;
}

function getTargetTriple() {
  return `${getArch()}-${getPlatform()}`;
}

function getBinaryName() {
  return process.platform === "win32" ? "sm-action.exe" : "sm-action";
}

async function buildFromSource(targetTriple) {
  const buildTarget = targetTriple.includes("linux")
    ? `${getArch()}-unknown-linux-gnu`
    : targetTriple;

  // Check if target is installed
  const installedTargets = execSync(
    "rustup target list --installed",
  ).toString();

  if (!installedTargets.includes(buildTarget)) {
    console.log(`Installing Rust target: ${buildTarget}`);
    execSync(`rustup target add ${buildTarget}`, { stdio: "inherit" });
  }

  console.log(`Building binary for target: ${buildTarget}`);
  execSync(`cargo build --release --target ${buildTarget}`, {
    stdio: "inherit",
  });
}

function copyBuiltBinary(targetTriple, binaryName, expectedPath) {
  const builtBinaryPath = path.join(
    __dirname,
    "target",
    targetTriple,
    "release",
    binaryName,
  );

  if (!fs.existsSync(builtBinaryPath)) {
    throw new Error(`Failed to build binary at ${builtBinaryPath}`);
  }

  ensureDirectoryExists(path.dirname(expectedPath));
  fs.copyFileSync(builtBinaryPath, expectedPath);
}

async function getBinary() {
  const targetTriple = getTargetTriple();
  const binaryName = getBinaryName();
  const binaryPath = path.join(
    __dirname,
    "target",
    targetTriple,
    "release",
    binaryName,
  );

  debug(`Looking for binary at: ${binaryPath}`);

  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  debug(`No sm-action binary found for target: ${targetTriple}`);

  const downloadSuccess = await downloadBinary(targetTriple, binaryPath);

  if (downloadSuccess) {
    return binaryPath;
  }

  console.log("sm-action binary download failed. Building from source...");
  await buildFromSource(targetTriple);
  copyBuiltBinary(targetTriple, binaryName, binaryPath);

  return binaryPath;
}

function makeExecutable(binaryPath) {
  if (process.platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }
}

async function run() {
  try {
    const binaryPath = await getBinary();
    makeExecutable(binaryPath);
    execSync(binaryPath, { stdio: "inherit" });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  VerificationError,
  buildDownloadUrl,
  downloadFile,
  getExpectedChecksum,
  verifyChecksum,
};

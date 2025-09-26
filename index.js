const { execSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const version = require("./version.json").version;

const repoOwner = "bitwarden";
const repoName = "sm-action";

function debug(message) {
  if ("RUNNER_DEBUG" in process.env || "ACTIONS_RUNNER_DEBUG" in process.env) {
    console.log(`::debug::${message}`);
  }
}

function getVersion() {
  if ("SM_ACTION_VERSION" in process.env) {
    console.log(
      `Using version from environment: ${process.env.SM_ACTION_VERSION}`,
    );
    return process.env.SM_ACTION_VERSION;
  }

  console.log(`Using version from version.js: ${version}`);
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

function cleanupDownload(file, request, outputPath) {
  file.close();
  safeUnlink(outputPath);
  request.destroy();
}

/**
 * Downloads a file from a URL to a local path
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        cleanupDownload(file, request, outputPath);
        return downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }

      // Handle non-success status codes
      if (response.statusCode !== 200) {
        cleanupDownload(file, request, outputPath);
        return reject(
          new Error(
            `Failed to download: ${response.statusCode} ${response.statusMessage}`,
          ),
        );
      }

      // Pipe response to file
      response.pipe(file);

      // Handle successful completion
      file.on("finish", () => {
        file.close();
        request.destroy();
        resolve();
      });

      // Handle file write errors
      file.on("error", (err) => {
        cleanupDownload(file, request, outputPath);
        reject(err);
      });
    });

    // Handle request errors
    request.on("error", (err) => {
      cleanupDownload(file, request, outputPath);
      reject(err);
    });

    // Set timeout to prevent hanging
    request.setTimeout(30000, () => {
      cleanupDownload(file, request, outputPath);
      reject(new Error("Download timeout"));
    });
  });
}

/**
 * Constructs the GitHub release download URL
 */
function buildDownloadUrl(targetTriple, version) {
  const releaseVersion = `${version}`;
  const assetName = `sm-action-${targetTriple}${
    process.platform === "win32" ? ".exe" : ""
  }`;

  return `https://github.com/${repoOwner}/${repoName}/releases/download/v${releaseVersion}/${assetName}`;
}

/**
 * Attempts to download the pre-built binary from GitHub Releases
 */
async function downloadBinary(targetTriple, binaryPath) {
  const version = getVersion();
  const downloadUrl = buildDownloadUrl(targetTriple, version);

  console.log(`Attempting to download binary from: ${downloadUrl}`);

  try {
    ensureDirectoryExists(path.dirname(binaryPath));
    await downloadFile(downloadUrl, binaryPath);
    console.log(`Successfully downloaded binary to: ${binaryPath}`);
    return true;
  } catch (error) {
    console.warn(`Failed to download binary: ${error.message}`);
    return false;
  }
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

run();

const { execSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");

/**
 * Determines the target architecture for the Rust binary
 */
function getArch() {
  const arch = process.arch;
  if (arch === "x64") {
    return "x86_64";
  } else if (arch === "arm64") {
    return "aarch64";
  } else {
    throw new Error(`Unsupported architecture: ${arch}`);
  }
}

/**
 * Determines the target platform for the Rust binary
 */
function getPlatform() {
  const platform = process.platform;
  if (platform === "linux") {
    return "unknown-linux-musl";
  } else if (platform === "darwin") {
    return "apple-darwin";
  } else if (platform === "win32") {
    return "pc-windows-msvc";
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Builds the Rust binary from source if needed
 */
async function buildFromSource(targetTriple) {
  // It's easier to build for GNU than cross-compiling for MUSL
  if (targetTriple.includes("linux")) {
    targetTriple = `${getArch()}-unknown-linux-gnu`;
  }

  // Check if target is installed
  const output = execSync("rustup target list --installed");
  const targetOutput = output.toString();

  if (!targetOutput.includes(targetTriple)) {
    execSync(`rustup target add ${targetTriple}`, { stdio: "inherit" });
  }

  execSync(`cargo build --release --target ${targetTriple}`, {
    stdio: "inherit",
  });
}

/**
 * Finds the Rust binary or builds it if necessary
 */
async function getBinary() {
  const targetTriple = `${getArch()}-${getPlatform()}`;
  const binaryName =
    process.platform === "win32" ? "sm-action.exe" : "sm-action";
  const binaryPath = path.join(
    __dirname,
    "target",
    targetTriple,
    "release",
    binaryName
  );

  console.debug(`Looking for binary at: ${binaryPath}`);

  if (!fs.existsSync(binaryPath)) {
    console.warn(`No sm-action binary found for target: ${targetTriple}`);
    await buildFromSource(targetTriple);

    // After building, the binary should be in target/TRIPLE/release/
    const builtBinaryPath = path.join(
      __dirname,
      "target",
      targetTriple,
      "release",
      binaryName
    );
    if (fs.existsSync(builtBinaryPath)) {
      // Ensure dist directory exists
      const distDir = path.dirname(binaryPath);
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      // Copy the built binary to the expected location
      fs.copyFileSync(builtBinaryPath, binaryPath);
    } else {
      throw new Error(`Failed to build binary at ${builtBinaryPath}`);
    }
  }

  return binaryPath;
}

/**
 * Main function
 */
async function run() {
  // Get the binary path
  const binaryPath = await getBinary();

  // Make sure the binary is executable
  if (process.platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }

  execSync(binaryPath, { stdio: "inherit" });
}

run();

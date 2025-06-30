#!/bin/sh

################################################################
# a shim to select the correct binary to execute the sm-action #
################################################################

if [ -n "$RUNNER_DEBUG" ] || [ -n "$ACTIONS_RUNNER_DEBUG" ]; then
  set -x
fi

arch() {
  output="$(node -p process.arch)"
  if [ "$output" = "x64" ]; then
    ARCH="x86_64"
  elif [ "$output" = "arm64" ]; then
    ARCH="aarch64"
  else
    echo "Unsupported architecture: $output" >&2
    exit 1
  fi

  echo "$ARCH"
}

os() {
  output="$(node -p process.platform)"
  if [ "$output" = "linux" ]; then
    PLATFORM="unknown-linux-musl"
  elif [ "$output" = "darwin" ]; then
    PLATFORM="apple-darwin"
  elif [ "$output" = "win32" ]; then
    PLATFORM="pc-windows-msvc"
  else
    echo "Unsupported platform: $output" >&2
    exit 1
  fi

  echo "$PLATFORM"
}

build_from_source() {
  echo "Attempting to build the binary..." >&2

  # It's easier to build for GNU than cross-compiling for MUSL
  if echo "$target_triple" | grep -q "linux"; then
    target_triple="$(arch)-unknown-linux-gnu"
  fi

  if ! rustup target list | grep installed | grep -q "$target_triple"; then
    echo "Target $target_triple not found, adding it..."
    if ! rustup target add "$target_triple"; then
      echo "Failed to add target $target_triple" >&2
      exit 1
    fi
  fi

  if ! cargo build --release --target "$target_triple"; then
    echo "Failed to build sm-action for target: $target_triple" >&2
    exit 1
  fi
}

# Main execution
main() {
  echo "Setting up bitwarden/sm-action"

  target_triple="$(arch)-$(os)"
  if [ ! -e ./dist/"$target_triple"/sm-action ]; then
    echo "No sm-action binary found for target: $target_triple" >&2
    build_from_source
  fi

  ./dist/"$target_triple"/release/sm-action
}

# Run the script
main


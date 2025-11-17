#!/bin/bash

set -e

version=$(jq -r '.dependencies["@bitwarden/sdk-napi"]' package.json)

npm pack "@bitwarden/sdk-napi@$version"
npm pack "@bitwarden/sdk-napi-linux-x64-gnu@$version"
npm pack "@bitwarden/sdk-napi-win32-x64-msvc@$version"
npm pack "@bitwarden/sdk-napi-darwin-x64@$version"
npm pack "@bitwarden/sdk-napi-darwin-arm64@$version"

rm -rf dist
mkdir -p dist/node_modules/@bitwarden

for pkg in sdk-napi sdk-napi-linux-x64-gnu sdk-napi-win32-x64-msvc sdk-napi-darwin-x64 sdk-napi-darwin-arm64; do
    mkdir -p "dist/node_modules/@bitwarden/$pkg"
    tar -xzf "bitwarden-$pkg-$version.tgz"
    mv package/* "dist/node_modules/@bitwarden/$pkg"
    rm -rf package
done

rm -f bitwarden-sdk-napi*.tgz
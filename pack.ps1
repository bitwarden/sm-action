$version = (Get-Content -raw ./package.json | ConvertFrom-Json).dependencies."@bitwarden/sdk-napi"

npm pack "@bitwarden/sdk-napi@$version"
npm pack "@bitwarden/sdk-napi-linux-x64-gnu@$version"
npm pack "@bitwarden/sdk-napi-win32-x64-msvc@$version"
npm pack "@bitwarden/sdk-napi-darwin-x64@$version"
npm pack "@bitwarden/sdk-napi-darwin-arm64@$version"

Remove-Item dist -r -force
New-Item dist -ItemType Directory
New-Item "dist/node_modules" -ItemType Directory
New-Item "dist/node_modules/@bitwarden" -ItemType Directory

New-Item "dist/node_modules/@bitwarden/sdk-napi" -ItemType Directory
tar -xzf bitwarden-sdk-napi-$version.tgz
Move-Item -Path "./package/*"  -Destination "./dist/node_modules/@bitwarden/sdk-napi"

New-Item "./dist/node_modules/@bitwarden/sdk-napi-linux-x64-gnu" -ItemType Directory
tar -xzf bitwarden-sdk-napi-linux-x64-gnu-$version.tgz
Move-Item -Path "./package/*"  -Destination "./dist/node_modules/@bitwarden/sdk-napi-linux-x64-gnu"

New-Item "./dist/node_modules/@bitwarden/sdk-napi-win32-x64-msvc" -ItemType Directory
tar -xzf bitwarden-sdk-napi-win32-x64-msvc-$version.tgz
Move-Item -Path "./package/*"  -Destination "./dist/node_modules/@bitwarden/sdk-napi-win32-x64-msvc"

New-Item "./dist/node_modules/@bitwarden/sdk-napi-darwin-x64"  -ItemType Directory
tar -xzf bitwarden-sdk-napi-darwin-x64-$version.tgz
Move-Item -Path "./package/*" -Destination "./dist/node_modules/@bitwarden/sdk-napi-darwin-x64"

New-Item "./dist/node_modules/@bitwarden/sdk-napi-darwin-arm64"  -ItemType Directory
tar -xzf bitwarden-sdk-napi-darwin-arm64-$version.tgz
Move-Item -Path "./package/*" -Destination "./dist/node_modules/@bitwarden/sdk-napi-darwin-arm64"

Remove-Item package -r -force
Remove-Item bitwarden-sdk-napi*.tgz

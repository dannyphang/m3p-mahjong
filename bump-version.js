const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const frontendPkgPath = path.join(__dirname, 'frontend', 'package.json');
const envVersionPath = path.join(__dirname, 'frontend', 'src', 'environments', 'version.ts');

try {
  // Read and bump package.json
  const pkg = JSON.parse(fs.readFileSync(frontendPkgPath, 'utf8'));
  const versionParts = pkg.version.split('.');
  
  // Increment patch version
  versionParts[2] = parseInt(versionParts[2], 10) + 1;
  const newVersion = versionParts.join('.');
  pkg.version = newVersion;
  
  // Save package.json
  fs.writeFileSync(frontendPkgPath, JSON.stringify(pkg, null, 2) + '\n');
  
  // Create environments folder if not exists
  const envDir = path.dirname(envVersionPath);
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true });
  }
  
  // Save version.ts
  fs.writeFileSync(envVersionPath, `export const APP_VERSION = '${newVersion}';\n`);
  
  // Stage files
  execSync(`git add ${frontendPkgPath} ${envVersionPath}`);
  
  console.log(`[Version Bump] Successfully bumped app version to ${newVersion}`);
} catch (e) {
  console.error('[Version Bump] Error updating version:', e.message);
  process.exit(1);
}

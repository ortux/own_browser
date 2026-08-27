/**
 * electron-builder afterPack hook — flips Electron fuses on the packaged
 * binary so the shipped app:
 *   - cannot be relaunched as a plain Node.js runtime (ELECTRON_RUN_AS_NODE)
 *   - ignores NODE_OPTIONS / --inspect CLI injection
 *   - only loads code from inside the ASAR archive (with integrity checks)
 *   - uses Chromium's OS-keychain cookie encryption
 *
 * See https://github.com/electron/fuses.
 */
const fs = require('node:fs');
const path = require('node:path');

async function resolveElectronBinary(context) {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push('zyphora.exe', 'Zyphora.exe', 'electron.exe');
  } else if (process.platform === 'darwin') {
    const productName = context.packager.appInfo.productFilename || 'Zyphora';
    candidates.push(
      path.join(`${productName}.app`, 'Contents', 'MacOS', productName),
    );
  } else {
    candidates.push('zyphora', 'Zyphora', 'electron');
  }
  for (const candidate of candidates) {
    const full = path.join(context.appOutDir, candidate);
    if (fs.existsSync(full)) return full;
  }
  throw new Error(`[fuses] could not locate the Electron binary in ${context.appOutDir}`);
}

module.exports = async function afterPack(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const binary = await resolveElectronBinary(context);
  console.log(`[fuses] hardening ${binary}`);
  await flipFuses(binary, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};

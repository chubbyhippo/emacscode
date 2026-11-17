import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const root = path.resolve(__dirname, '../..');
const installPath = path.join(root, '.emacs-oracle');
const windowsArchive = {
  url: 'https://ftp.gnu.org/gnu/emacs/windows/emacs-31/emacs-31.1_1.zip',
  hash: '02856997d64c42e1e267b12b03ed67ff19a0599983e2f5871637077f7d12a92e',
  name: 'emacs.zip'
};
const sourceArchive = {
  url: 'https://ftp.gnu.org/gnu/emacs/emacs-31.1.tar.gz',
  hash: '3cad7fd1466c0e24867df8d2609da3ac75abc90d7c4c0175e410e9be46d4092a',
  name: 'emacs.tar.gz'
};

export function validate(binary: string): string {
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 15000 });
  if (!/^GNU Emacs 31\.1(?:\s|$)/.test(version)) throw new Error(`Expected GNU Emacs 31.1: ${binary}`);
  return binary;
}

function download(url: string | URL, redirects = 0): Promise<IncomingMessage> {
  if (redirects > 5) return Promise.reject(new Error('Too many Emacs download redirects'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) return reject(new Error('Emacs download redirect has no location'));
        const next = new URL(response.headers.location, url);
        if (next.protocol !== 'https:') return reject(new Error('Emacs download redirected to an insecure URL'));
        download(next, redirects + 1).then(resolve, reject);
      } else if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Emacs download failed: HTTP ${response.statusCode}`));
      } else {
        response.setTimeout(180000, () => response.destroy(new Error('Emacs download timed out')));
        resolve(response);
      }
    });
    request.setTimeout(180000, () => request.destroy(new Error('Emacs download timed out')));
    request.on('error', reject);
  });
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function buildSource(archive: string, staging: string, target: string, platform: string, run: (command: string, args: string[], options: ExecFileSyncOptions) => unknown = execFileSync): string {
  const source = path.join(staging, 'emacs-31.1');
  const destination = path.join(staging, 'install');
  const installed = path.join(destination, target.slice(path.parse(target).root.length));
  const options: ExecFileSyncOptions = { cwd: source, stdio: 'inherit', timeout: 3600000 };
  run('tar', ['-xzf', archive, '-C', staging], { stdio: 'inherit', timeout: 600000 });
  const configure = [`--prefix=${target}`, '--without-all', '--without-x'];
  if (platform === 'darwin') configure.push('--without-ns');
  run('sh', [path.join(source, 'configure'), ...configure], options);
  run('make', [`-j${Math.min(os.availableParallelism(), 4)}`], options);
  run('make', ['install', `DESTDIR=${destination}`], options);
  return installed;
}

export async function setup(options: { target?: string; archive?: string; ignoreOverride?: boolean; required?: boolean } = {}): Promise<string | undefined> {
  const target = path.resolve(options.target || installPath);
  const binary = path.join(target, 'bin', process.platform === 'win32' ? 'emacs.exe' : 'emacs');
  if (process.env.EMACS_ORACLE && !options.ignoreOverride) {
    return validate(process.env.EMACS_ORACLE);
  }
  if (fs.existsSync(target)) {
    try { return validate(binary); }
    catch (error) { throw new Error(`Existing Emacs installation at ${target} is invalid; repair or remove it before retrying: ${error.message}`); }
  }
  const windows = process.platform === 'win32' && process.arch === 'x64';
  const unix = process.platform === 'linux' || process.platform === 'darwin';
  if (!windows && !unix) {
    if (options.required) throw new Error('Automatic Emacs setup supports Windows x64, Linux, and macOS; set EMACS_ORACLE to GNU Emacs 31.1 on this platform.');
    console.warn('Emacs oracle setup skipped: unsupported platform. Set EMACS_ORACLE to GNU Emacs 31.1 to run oracle tests.');
    return undefined;
  }
  const release = windows ? windowsArchive : sourceArchive;
  const staging = await fsp.mkdtemp(path.join(path.dirname(target), '.emacs-setup-'));
  const archive = path.join(staging, release.name);
  try {
    if (options.archive) await fsp.copyFile(options.archive, archive);
    else {
      console.log(`Downloading GNU Emacs 31.1 from ${release.url}`);
      await pipeline(await download(release.url), fs.createWriteStream(archive, { flags: 'wx' }));
    }
    if (await hashFile(archive) !== release.hash) throw new Error('Emacs archive SHA-256 mismatch; download discarded');
    let extracted;
    if (windows) {
      extracted = path.join(staging, 'emacs');
      await fsp.mkdir(extracted);
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:EMACSCODE_ARCHIVE -DestinationPath $env:EMACSCODE_EXTRACT -Force'], {
        stdio: 'inherit', timeout: 600000,
        env: { ...process.env, EMACSCODE_ARCHIVE: archive, EMACSCODE_EXTRACT: extracted }
      });
      validate(path.join(extracted, 'bin', 'emacs.exe'));
    } else {
      console.log('Building terminal-only GNU Emacs 31.1 from source');
      try { extracted = buildSource(archive, staging, target, process.platform); }
      catch (error) { throw new Error(`Emacs source build failed; ensure tar, gzip, a C compiler, GNU make, and terminal development libraries are installed: ${error.message}`); }
    }
    try { await fsp.rename(extracted, target); }
    catch (error) {
      if (fs.existsSync(target)) {
        try { return validate(binary); }
        catch (validationError) { throw new Error(`Existing Emacs installation at ${target} is invalid; repair or remove it before retrying: ${validationError.message}`); }
      }
      throw error;
    }
    try { validate(binary); }
    catch (error) {
      throw new Error(`Installed Emacs validation failed at ${target}; repair or remove it before retrying: ${error.message}`);
    }
    console.log(`GNU Emacs 31.1 installed at ${target}`);
    return binary;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

if (require.main === module) setup().catch(error => { console.error(`Emacs setup failed: ${error.message}`); process.exitCode = 1; });
export { installPath };

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// P01: local read-only snapshot. Never loads application modules or private config.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = rel => fs.readFileSync(path.join(root, rel));
const git = args => cp.execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--installed-package')) {
  console.error('Usage: node scripts/snapshot-dialogue-baseline.mjs [--installed-package path/to/package.json]');
  process.exit(2);
}
try {
  const pkg = JSON.parse(read('app/dsh-hymemory-plugin/package.json'));
  const versions = JSON.parse(read('app/versions.json'));
  const sourceFiles = git(['ls-files', '-z', '--', 'app/dsh-hymemory-plugin/']).split('\0').filter(Boolean).sort();
  const sourceManifest = sourceFiles.map(file => ({file, sha256:sha(read(file))}));
  const archive = `app/packages/dsh-hymemory-qq-${pkg.version}.tgz`;
  const engine = read('app/dsh-hymemory-plugin/dialogue-engine/index.js').toString('utf8');
  const adapter = read('app/dsh-hymemory-plugin/dialogue-adapter.js').toString('utf8');
  const expectedDefaults = [
    ['variant_D', /generateDialogueReply\(input,\s*\{ generate, variant = 'D'/s.test(engine)],
    ['stable_style', /inputFormat = 'json', stylePreset = 'stable'/.test(engine)],
    ['planning_off', /separatePlanning = false/.test(engine)],
    ['post_alignment_off', /postAlign = false/.test(engine)],
    ['review_off', /reviewReply = false/.test(engine)],
    ['adapter_one_pass', /maxTokens, sessionId, separatePlanning:false, postAlign:false/.test(adapter)],
  ];
  const checks = cp.spawnSync(process.execPath, ['scripts/check-repository.mjs'], {cwd:root, encoding:'utf8'});
  let repositoryCheck;
  try { repositoryCheck = JSON.parse(checks.stdout); }
  catch { throw Error('RepositoryCheckOutputInvalid'); }
  let installed = {status:'NOT_CHECKED'};
  if (args.length) {
    // Only an explicitly selected package manifest is read. Never scan profile data.
    const bytes = fs.readFileSync(path.resolve(args[1]));
    const manifest = JSON.parse(bytes);
    if (manifest.name !== pkg.name || typeof manifest.version !== 'string') throw Error('InstalledManifestInvalid');
    installed = {status:'MANIFEST_ONLY', version:manifest.version, manifestSha256:sha(bytes), payloadVerified:false};
  }
  const errors = [];
  if (pkg.version !== versions.cordis_plugin) errors.push('CandidateVersionMismatch');
  if (checks.status !== 0) errors.push('RepositoryCheckFailed');
  for (const [name, valid] of expectedDefaults) if (!valid) errors.push(`SourceDefaultContractChanged:${name}`);
  const report = {
    schemaVersion:1, task:'P01', capturedAt:new Date().toISOString(),
    head:git(['rev-parse','HEAD']), worktree:git(['status','--porcelain']).split('\n').filter(Boolean),
    environment:{node:process.version, platform:process.platform, arch:process.arch},
    candidate:{version:pkg.version, archive, archiveSha256:sha(read(archive)),
      sourceFileCount:sourceFiles.length, sourceManifestSha256:sha(JSON.stringify(sourceManifest)),
      lockSha256:sha(read('app/dependency-locks/qqbot-profile/pnpm-lock.yaml'))},
    sourceDefaults:{basis:'STATIC_SOURCE_CONTRACT_ONLY', variant:'D', stylePreset:'stable', inputFormat:'json',
      separatePlanning:false, postAlign:false, reviewReply:false, learnedParticipationService:'NOT_IMPLEMENTED',
      adapterSha256:sha(Buffer.from(adapter)), engineSha256:sha(Buffer.from(engine)), checks:expectedDefaults},
    installed, running:{status:'NOT_VERIFIED',version:null},
    candidateInstalledMatch:installed.version ? installed.version === pkg.version : null,
    repositoryCheck:{exitCode:checks.status,...repositoryCheck},
    gates:{productionDeployment:'NOT_AUTHORIZED', modelCalls:'NOT_RUN', training:'NOT_RUN',
      realQQ:'NOT_RUN', contentAcceptance:'NOT_ACCEPTED', rollout:'HOLD'},
    limitations:['Tracked source hashes do not establish loaded process identity.',
      'Installed manifest does not verify installed payload.',
      'Static defaults do not assert runtime configuration.',
      'Repository checker is not a reverse-complete npm package manifest audit.'], errors,
  };
  console.log(JSON.stringify(report,null,2));
  if(errors.length) process.exitCode=1;
} catch {
  // Never echo input paths, private JSON or child process output on failure.
  console.error('BaselineSnapshotFailed: inspect input manifest, source defaults and repository check locally.');
  process.exitCode=1;
}

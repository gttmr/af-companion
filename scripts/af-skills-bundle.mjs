#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertMemberId,
  assertPlainDirectory,
  BUNDLE_DIGEST_ALGORITHM,
  bundleDigest,
  copyTree,
  ensureInside,
  listManifestMembers,
  manifestWithMemberDigests,
  manifestContractDigest,
  MANIFEST_CONTRACT_DIGEST_ALGORITHM,
  readJson,
  TREE_DIGEST_ALGORITHM,
  treeDigest,
  validateManifestDigests,
  writeJsonAtomic,
} from './af-skills-bundle-support.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_MANIFEST = path.join(
  REPOSITORY_ROOT,
  '.agents',
  'skills',
  'af-skills-vnext-manifest.json',
);
const RECEIPT_NAME = '.af-skills-vnext-install.json';

function fail(message) {
  process.stderr.write(`af-skills-bundle: ${message}\n`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const name = token.slice(2).replaceAll('-', '_');
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for ${token}`);
    }
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function sourcePathFor(member) {
  return path.isAbsolute(member.source_path)
    ? member.source_path
    : path.resolve(REPOSITORY_ROOT, member.source_path);
}

function assertManifestContract(manifest) {
  if (manifest.schema_version !== 1 || manifest.bundle_id !== 'af-skills-vnext') {
    throw new Error('unsupported AF Skills bundle manifest');
  }
  if (manifest.distribution?.mode !== 'offline_user_scoped') {
    throw new Error('bundle must use the offline user-scoped distribution contract');
  }
  if (manifest.distribution?.online_install !== false) {
    throw new Error('online installation must remain disabled');
  }
}

function currentSourceState() {
  const manifest = readJson(SOURCE_MANIFEST);
  assertManifestContract(manifest);
  const members = listManifestMembers(manifest).map((member) => ({
    ...member,
    actual_tree_digest: treeDigest(sourcePathFor(member)),
  }));
  return { manifest, members };
}

function digestSource() {
  const { manifest, members } = currentSourceState();
  const resolvedManifest = manifestWithMemberDigests(manifest, members);
  const normalized = listManifestMembers(resolvedManifest).map((member) => ({
    member_id: member.member_id,
    kind: member.kind,
    source_path: member.source_path,
    tree_digest_algorithm: TREE_DIGEST_ALGORITHM,
    tree_digest: member.tree_digest,
  }));
  const contractDigest = manifestContractDigest(resolvedManifest);
  process.stdout.write(
    `${JSON.stringify(
      {
        bundle_digest_algorithm: BUNDLE_DIGEST_ALGORITHM,
        manifest_contract_digest_algorithm: MANIFEST_CONTRACT_DIGEST_ALGORITHM,
        manifest_contract_digest: contractDigest,
        bundle_digest: bundleDigest(normalized, contractDigest),
        members: normalized,
        declared_bundle_digest: manifest.bundle_digest,
      },
      null,
      2,
    )}\n`,
  );
}

function verifySource() {
  const { manifest, members } = currentSourceState();
  validateManifestDigests(manifest);
  for (const member of members) {
    if (member.actual_tree_digest !== member.tree_digest) {
      throw new Error(
        `source digest mismatch for ${member.member_id}: expected ${member.tree_digest}, computed ${member.actual_tree_digest}`,
      );
    }
  }
  return { manifest, members };
}

function bundlePaths(bundleRoot) {
  const root = path.resolve(bundleRoot);
  assertPlainDirectory(root, 'Bundle root');
  const manifestPath = path.join(root, 'manifest.json');
  const skillsRoot = path.join(root, 'skills');
  const manifest = readJson(manifestPath);
  assertManifestContract(manifest);
  const members = validateManifestDigests(manifest);
  assertPlainDirectory(skillsRoot, 'Bundle skills root');

  const expected = new Set(members.map((member) => member.member_id));
  const actual = fs.readdirSync(skillsRoot);
  for (const name of actual) {
    assertMemberId(name);
    if (!expected.has(name)) {
      throw new Error(`unexpected member in bundle: ${name}`);
    }
  }
  if (actual.length !== expected.size) {
    throw new Error('bundle member set does not match its manifest');
  }
  for (const member of members) {
    const memberRoot = ensureInside(skillsRoot, path.join(skillsRoot, member.member_id));
    const actualDigest = treeDigest(memberRoot);
    if (actualDigest !== member.tree_digest) {
      throw new Error(
        `packed digest mismatch for ${member.member_id}: expected ${member.tree_digest}, computed ${actualDigest}`,
      );
    }
  }
  return { root, manifest, members, skillsRoot };
}

function pack(outputPath) {
  if (!outputPath) {
    throw new Error('pack requires --output <new-directory>');
  }
  const output = path.resolve(outputPath);
  if (fs.existsSync(output)) {
    throw new Error(`pack output already exists: ${output}`);
  }
  const { manifest, members } = verifySource();
  fs.mkdirSync(output, { recursive: false, mode: 0o755 });
  try {
    const skillsRoot = path.join(output, 'skills');
    fs.mkdirSync(skillsRoot, { mode: 0o755 });
    for (const member of members) {
      copyTree(sourcePathFor(member), path.join(skillsRoot, member.member_id));
    }
    fs.copyFileSync(SOURCE_MANIFEST, path.join(output, 'manifest.json'));
    bundlePaths(output);
  } catch (error) {
    fs.rmSync(output, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(`packed ${manifest.bundle_id}@${manifest.bundle_version} at ${output}\n`);
}

export function installBundle(bundleRoot, targetHome, expectedDigest, copyMember = copyTree) {
  if (!bundleRoot || !targetHome || !expectedDigest) {
    throw new Error(
      'install requires --bundle <directory> --target <user-home> --expected-digest <sha256>',
    );
  }
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error('install expected bundle digest must be a lowercase sha256');
  }
  const bundle = bundlePaths(bundleRoot);
  if (bundle.manifest.bundle_digest !== expectedDigest) {
    throw new Error(
      `trusted bundle digest mismatch: expected ${expectedDigest}, got ${bundle.manifest.bundle_digest}`,
    );
  }
  const home = fs.realpathSync(path.resolve(targetHome));
  assertPlainDirectory(home, 'Install target home');
  const agentsRoot = path.join(home, '.agents');
  const skillsRoot = path.join(agentsRoot, 'skills');
  const receiptPath = path.join(agentsRoot, RECEIPT_NAME);
  if (fs.existsSync(receiptPath)) {
    throw new Error(`an AF Skills install receipt already exists: ${receiptPath}`);
  }
  if (fs.existsSync(agentsRoot)) {
    assertPlainDirectory(agentsRoot, 'Target .agents');
  } else {
    fs.mkdirSync(agentsRoot, { mode: 0o700 });
  }
  if (fs.existsSync(skillsRoot)) {
    assertPlainDirectory(skillsRoot, 'Target Skill root');
  } else {
    fs.mkdirSync(skillsRoot, { mode: 0o755 });
  }

  const backupName = `.af-skills-vnext-backup-${Date.now()}-${process.pid}`;
  const backupRoot = path.join(agentsRoot, backupName);
  if (fs.existsSync(backupRoot)) {
    throw new Error(`backup root already exists: ${backupRoot}`);
  }
  const operations = [];
  try {
    for (const member of bundle.members) {
      const destination = ensureInside(
        skillsRoot,
        path.join(skillsRoot, assertMemberId(member.member_id)),
      );
      const backup = ensureInside(agentsRoot, path.join(backupRoot, member.member_id));
      const hadPrevious = fs.existsSync(destination);
      if (hadPrevious) {
        assertPlainDirectory(destination, `Existing ${member.member_id}`);
        fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
        fs.renameSync(destination, backup);
      }
      operations.push({ member, destination, backup, hadPrevious });
      copyMember(path.join(bundle.skillsRoot, member.member_id), destination);
    }

    const receipt = {
      schema_version: 1,
      bundle_id: bundle.manifest.bundle_id,
      bundle_version: bundle.manifest.bundle_version,
      bundle_digest: bundle.manifest.bundle_digest,
      trusted_expected_bundle_digest: expectedDigest,
      installed_at: new Date().toISOString(),
      target_home: home,
      backup_root: backupName,
      members: operations.map(({ member, hadPrevious }) => ({
        member_id: member.member_id,
        tree_digest: member.tree_digest,
        had_previous: hadPrevious,
      })),
    };
    writeJsonAtomic(receiptPath, receipt);
  } catch (error) {
    for (const operation of operations.reverse()) {
      if (fs.existsSync(operation.destination)) {
        fs.rmSync(operation.destination, { recursive: true, force: true });
      }
      if (operation.hadPrevious && fs.existsSync(operation.backup)) {
        fs.renameSync(operation.backup, operation.destination);
      }
    }
    fs.rmSync(backupRoot, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(
    `installed ${bundle.manifest.bundle_id}@${bundle.manifest.bundle_version} into ${skillsRoot}\n`,
  );
}

function rollback(targetHome) {
  if (!targetHome) {
    throw new Error('rollback requires --target <user-home>');
  }
  const home = fs.realpathSync(path.resolve(targetHome));
  const agentsRoot = path.join(home, '.agents');
  const skillsRoot = path.join(agentsRoot, 'skills');
  const receiptPath = path.join(agentsRoot, RECEIPT_NAME);
  const receipt = readJson(receiptPath);
  if (
    receipt.schema_version !== 1 ||
    receipt.bundle_id !== 'af-skills-vnext' ||
    receipt.target_home !== home ||
    !Array.isArray(receipt.members)
  ) {
    throw new Error('invalid or wrong-target AF Skills install receipt');
  }
  if (!/^\.af-skills-vnext-backup-[0-9]+-[0-9]+$/.test(receipt.backup_root ?? '')) {
    throw new Error('invalid backup root in AF Skills install receipt');
  }
  const backupRoot = ensureInside(
    agentsRoot,
    path.join(agentsRoot, receipt.backup_root),
    'backup root',
  );

  const receiptMemberIds = receipt.members.map((member) =>
    assertMemberId(member.member_id),
  );
  if (new Set(receiptMemberIds).size !== receiptMemberIds.length) {
    throw new Error('duplicate member id in AF Skills install receipt');
  }

  const operations = receipt.members.map((member) => {
    const memberId = assertMemberId(member.member_id);
    if (!/^[a-f0-9]{64}$/.test(member.tree_digest ?? '')) {
      throw new Error(`invalid tree digest in receipt: ${memberId}`);
    }
    if (typeof member.had_previous !== 'boolean') {
      throw new Error(`invalid backup flag in receipt: ${memberId}`);
    }
    const destination = ensureInside(skillsRoot, path.join(skillsRoot, memberId));
    const backup = ensureInside(backupRoot, path.join(backupRoot, memberId));
    if (!fs.existsSync(destination)) {
      throw new Error(`installed member is missing; rollback stopped: ${memberId}`);
    }
    const actualDigest = treeDigest(destination);
    if (actualDigest !== member.tree_digest) {
      throw new Error(`installed member was modified; rollback stopped: ${memberId}`);
    }
    if (member.had_previous && !fs.existsSync(backup)) {
      throw new Error(`required backup is missing; rollback stopped: ${memberId}`);
    }
    if (!member.had_previous && fs.existsSync(backup)) {
      throw new Error(`unexpected backup exists; rollback stopped: ${memberId}`);
    }
    if (member.had_previous) {
      assertPlainDirectory(backup, `Backup ${memberId}`);
    }
    return { memberId, destination, backup, hadPrevious: member.had_previous };
  });

  for (const operation of operations) {
    fs.rmSync(operation.destination, { recursive: true });
    if (operation.hadPrevious) {
      fs.renameSync(operation.backup, operation.destination);
    }
  }
  fs.rmSync(backupRoot, { recursive: true, force: true });
  fs.unlinkSync(receiptPath);
  process.stdout.write(`rolled back ${receipt.bundle_id}@${receipt.bundle_version} from ${skillsRoot}\n`);
}

function usage() {
  process.stdout.write(`Usage:
  node scripts/af-skills-bundle.mjs digest
  node scripts/af-skills-bundle.mjs verify [--bundle <directory>]
  node scripts/af-skills-bundle.mjs pack --output <new-directory>
  node scripts/af-skills-bundle.mjs install --bundle <directory> --target <user-home> --expected-digest <sha256>
  node scripts/af-skills-bundle.mjs rollback --target <user-home>
`);
}

function main(argv) {
  const { command, options } = parseArguments(argv);
  if (command === 'digest') {
    digestSource();
  } else if (command === 'verify') {
    const result = options.bundle ? bundlePaths(options.bundle) : verifySource();
    process.stdout.write(
      `verified ${result.manifest.bundle_id}@${result.manifest.bundle_version} (${result.members.length} members)\n`,
    );
  } else if (command === 'pack') {
    pack(options.output);
  } else if (command === 'install') {
    installBundle(options.bundle, options.target, options.expected_digest);
  } else if (command === 'rollback') {
    rollback(options.target);
  } else if (!command || command === 'help' || command === '--help') {
    usage();
  } else {
    throw new Error(`unknown command: ${command}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

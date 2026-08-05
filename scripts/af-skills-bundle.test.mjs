import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { installBundle } from './af-skills-bundle.mjs';
import {
  bundleDigest,
  listManifestMembers,
  manifestContractDigest,
  manifestWithMemberDigests,
  readJson,
  treeDigest,
  validateManifestDigests,
} from './af-skills-bundle-support.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'af-skills-bundle.mjs');
const SOURCE_MANIFEST = path.join(
  ROOT,
  '.agents',
  'skills',
  'af-skills-vnext-manifest.json',
);

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

test('offline user-scope pack, install, verify and rollback restore prior Skill bytes', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'af-skills-bundle-'));
  try {
    const bundle = path.join(temporary, 'bundle');
    const target = path.join(temporary, 'home');
    const oldSkill = path.join(target, '.agents', 'skills', 'af-workflow');
    fs.mkdirSync(oldSkill, { recursive: true });
    fs.writeFileSync(path.join(oldSkill, 'legacy.txt'), 'preserve-me\n');

    run(['pack', '--output', bundle]);
    run(['verify', '--bundle', bundle]);
    const manifest = readJson(SOURCE_MANIFEST);
    run([
      'install',
      '--bundle',
      bundle,
      '--target',
      target,
      '--expected-digest',
      manifest.bundle_digest,
    ]);

    for (const member of listManifestMembers(manifest)) {
      const installed = path.join(target, '.agents', 'skills', member.member_id);
      assert.equal(treeDigest(installed), member.tree_digest);
    }
    assert.ok(fs.existsSync(path.join(target, '.agents', '.af-skills-vnext-install.json')));

    run(['rollback', '--target', target]);
    assert.equal(fs.readFileSync(path.join(oldSkill, 'legacy.txt'), 'utf8'), 'preserve-me\n');
    assert.deepEqual(fs.readdirSync(path.join(target, '.agents', 'skills')), ['af-workflow']);
    assert.ok(!fs.existsSync(path.join(target, '.agents', '.af-skills-vnext-install.json')));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('rollback fails closed when an installed Skill changed', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'af-skills-tamper-'));
  try {
    const bundle = path.join(temporary, 'bundle');
    const target = path.join(temporary, 'home');
    fs.mkdirSync(target);
    run(['pack', '--output', bundle]);
    const manifest = readJson(SOURCE_MANIFEST);
    run([
      'install',
      '--bundle',
      bundle,
      '--target',
      target,
      '--expected-digest',
      manifest.bundle_digest,
    ]);
    fs.appendFileSync(
      path.join(target, '.agents', 'skills', 'af-workflow', 'SKILL.md'),
      '\nmodified-after-install\n',
    );

    const rollback = run(['rollback', '--target', target], 1);
    assert.match(rollback.stderr, /installed member was modified; rollback stopped/);
    assert.ok(fs.existsSync(path.join(target, '.agents', '.af-skills-vnext-install.json')));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('packed compatibility metadata is covered by the manifest contract digest', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'af-skills-manifest-'));
  try {
    const bundle = path.join(temporary, 'bundle');
    run(['pack', '--output', bundle]);
    const manifestPath = path.join(bundle, 'manifest.json');
    const manifest = readJson(manifestPath);
    manifest.compatibility.status = 'compatible';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const verification = run(['verify', '--bundle', bundle], 1);
    assert.match(verification.stderr, /manifest contract digest mismatch/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('install removes a partial destination and restores prior bytes after copy failure', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'af-skills-partial-copy-'));
  try {
    const bundle = path.join(temporary, 'bundle');
    const target = path.join(temporary, 'home');
    const manifest = readJson(SOURCE_MANIFEST);
    const firstMember = listManifestMembers(manifest)[0];
    const previous = path.join(target, '.agents', 'skills', firstMember.member_id);
    fs.mkdirSync(previous, { recursive: true });
    fs.writeFileSync(path.join(previous, 'legacy.txt'), 'restore-me\n');
    run(['pack', '--output', bundle]);

    assert.throws(
      () =>
        installBundle(
          bundle,
          target,
          manifest.bundle_digest,
          (_source, destination) => {
            fs.mkdirSync(destination, { recursive: false });
            fs.writeFileSync(path.join(destination, 'partial.txt'), 'partial\n');
            throw new Error('injected partial copy failure');
          },
        ),
      /injected partial copy failure/,
    );
    assert.equal(fs.readFileSync(path.join(previous, 'legacy.txt'), 'utf8'), 'restore-me\n');
    assert.deepEqual(fs.readdirSync(path.join(target, '.agents', 'skills')), [
      firstMember.member_id,
    ]);
    assert.ok(!fs.existsSync(path.join(target, '.agents', '.af-skills-vnext-install.json')));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('install rejects a fully recomputed substitute bundle without its trusted digest', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'af-skills-provenance-'));
  try {
    const bundle = path.join(temporary, 'bundle');
    const target = path.join(temporary, 'home');
    const trustedManifest = readJson(SOURCE_MANIFEST);
    run(['pack', '--output', bundle]);

    const manifestPath = path.join(bundle, 'manifest.json');
    const manifest = readJson(manifestPath);
    const substituted = manifest.af_skills[0];
    fs.appendFileSync(
      path.join(bundle, 'skills', substituted.skill_id, 'SKILL.md'),
      '\nsubstituted-bundle-bytes\n',
    );
    substituted.tree_digest = treeDigest(path.join(bundle, 'skills', substituted.skill_id));
    manifest.manifest_contract_digest = manifestContractDigest(manifest);
    manifest.bundle_digest = bundleDigest(
      listManifestMembers(manifest),
      manifest.manifest_contract_digest,
    );
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    run(['verify', '--bundle', bundle]);
    fs.mkdirSync(target);
    const installation = run(
      [
        'install',
        '--bundle',
        bundle,
        '--target',
        target,
        '--expected-digest',
        trustedManifest.bundle_digest,
      ],
      1,
    );
    assert.match(installation.stderr, /trusted bundle digest mismatch/);
    assert.ok(!fs.existsSync(path.join(target, '.agents')));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('digest resolution replaces stale declarations before aggregate hashing', () => {
  const manifest = readJson(SOURCE_MANIFEST);
  const measured = listManifestMembers(manifest).map((member) => ({
    ...member,
    actual_tree_digest: member.tree_digest,
  }));
  measured[0].actual_tree_digest = 'f'.repeat(64);
  const resolved = manifestWithMemberDigests(manifest, measured);
  assert.equal(resolved.required_google_skills[0].tree_digest, 'f'.repeat(64));
  assert.notEqual(manifestContractDigest(resolved), manifest.manifest_contract_digest);

  resolved.manifest_contract_digest = manifestContractDigest(resolved);
  resolved.bundle_digest = bundleDigest(
    listManifestMembers(resolved),
    resolved.manifest_contract_digest,
  );
  assert.doesNotThrow(() => validateManifestDigests(resolved));
});

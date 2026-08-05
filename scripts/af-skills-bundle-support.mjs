import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TREE_DIGEST_ALGORITHM =
  'sha256(UTF-8-bytewise-sorted relative_path + NUL + sha256(file_bytes) + LF)';
export const BUNDLE_DIGEST_ALGORITHM =
  'sha256(UTF-8-bytewise-sorted member_id + NUL + digest + LF, including _manifest-contract)';
export const MANIFEST_CONTRACT_DIGEST_ALGORITHM =
  'sha256(canonical JSON excluding bundle_digest and manifest_contract_digest)';

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJsonAtomic(filePath, value) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(temporary, filePath);
}

export function assertMemberId(memberId) {
  if (
    typeof memberId !== 'string' ||
    !/^(?:_[a-z0-9][a-z0-9-]*|[a-z0-9][a-z0-9-]*)$/.test(memberId)
  ) {
    throw new Error(`unsafe bundle member id: ${String(memberId)}`);
  }
  return memberId;
}

export function assertPlainDirectory(directory, label = directory) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function collectFiles(root, current, files) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`symbolic links are forbidden in a Skill bundle: ${relative}`);
    }
    if (stat.isDirectory()) {
      collectFiles(root, absolute, files);
      continue;
    }
    if (!stat.isFile()) {
      throw new Error(`non-regular bundle member is forbidden: ${relative}`);
    }
    files.push({ absolute, relative });
  }
}

export function treeDigest(root) {
  assertPlainDirectory(root, 'Skill tree');
  const files = [];
  collectFiles(root, root, files);
  files.sort((left, right) =>
    Buffer.compare(Buffer.from(left.relative, 'utf8'), Buffer.from(right.relative, 'utf8')),
  );

  const digest = crypto.createHash('sha256');
  for (const file of files) {
    const contentDigest = crypto
      .createHash('sha256')
      .update(fs.readFileSync(file.absolute))
      .digest('hex');
    digest.update(file.relative, 'utf8');
    digest.update('\0', 'utf8');
    digest.update(contentDigest, 'utf8');
    digest.update('\n', 'utf8');
  }
  return digest.digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((left, right) =>
      Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')),
    );
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function manifestContractDigest(manifest) {
  const contract = structuredClone(manifest);
  delete contract.bundle_digest;
  delete contract.manifest_contract_digest;
  return crypto.createHash('sha256').update(canonicalJson(contract), 'utf8').digest('hex');
}

export function bundleDigest(members, manifestDigest) {
  if (!/^[a-f0-9]{64}$/.test(manifestDigest ?? '')) {
    throw new Error('invalid manifest contract digest');
  }
  const normalized = members
    .map((member) => ({
      memberId: assertMemberId(member.member_id ?? member.skill_id),
      treeDigest: member.tree_digest,
    }))
    .concat([{ memberId: '_manifest-contract', treeDigest: manifestDigest }])
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left.memberId, 'utf8'), Buffer.from(right.memberId, 'utf8')),
    );
  const seen = new Set();
  const digest = crypto.createHash('sha256');
  for (const member of normalized) {
    if (seen.has(member.memberId)) {
      throw new Error(`duplicate bundle member id: ${member.memberId}`);
    }
    seen.add(member.memberId);
    if (!/^[a-f0-9]{64}$/.test(member.treeDigest ?? '')) {
      throw new Error(`invalid tree digest for ${member.memberId}`);
    }
    digest.update(member.memberId, 'utf8');
    digest.update('\0', 'utf8');
    digest.update(member.treeDigest, 'utf8');
    digest.update('\n', 'utf8');
  }
  return digest.digest('hex');
}

export function copyTree(source, destination) {
  assertPlainDirectory(source, 'Bundle source');
  if (fs.existsSync(destination)) {
    throw new Error(`destination already exists: ${destination}`);
  }
  fs.mkdirSync(destination, { recursive: false, mode: 0o755 });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    const stat = fs.lstatSync(sourcePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`symbolic links are forbidden in a Skill bundle: ${sourcePath}`);
    }
    if (stat.isDirectory()) {
      copyTree(sourcePath, destinationPath);
      continue;
    }
    if (!stat.isFile()) {
      throw new Error(`non-regular bundle member is forbidden: ${sourcePath}`);
    }
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(destinationPath, stat.mode & 0o777);
  }
}

export function ensureInside(root, candidate, label = 'path') {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its root: ${candidate}`);
  }
  return candidate;
}

export function listManifestMembers(manifest) {
  const google = (manifest.required_google_skills ?? []).map((member) => ({
    ...member,
    member_id: member.skill_id,
    kind: 'google_skill',
  }));
  const af = (manifest.af_skills ?? []).map((member) => ({
    ...member,
    member_id: member.skill_id,
    kind: 'af_skill',
  }));
  const support = (manifest.support_trees ?? []).map((member) => ({
    ...member,
    kind: 'support',
  }));
  return [...google, ...af, ...support];
}

export function manifestWithMemberDigests(manifest, measuredMembers) {
  const resolved = structuredClone(manifest);
  const measured = new Map();
  for (const member of measuredMembers) {
    const memberId = assertMemberId(member.member_id ?? member.skill_id);
    if (measured.has(memberId)) {
      throw new Error(`duplicate measured bundle member id: ${memberId}`);
    }
    if (!/^[a-f0-9]{64}$/.test(member.actual_tree_digest ?? '')) {
      throw new Error(`missing or invalid measured tree digest for ${memberId}`);
    }
    measured.set(memberId, member.actual_tree_digest);
  }

  const declared = [
    ...(resolved.required_google_skills ?? []).map((member) => ({
      member_id: member.skill_id,
      member,
    })),
    ...(resolved.af_skills ?? []).map((member) => ({ member_id: member.skill_id, member })),
    ...(resolved.support_trees ?? []).map((member) => ({
      member_id: member.member_id,
      member,
    })),
  ];
  if (declared.length !== measured.size) {
    throw new Error('measured bundle member set does not match its manifest');
  }
  for (const member of declared) {
    const memberId = assertMemberId(member.member_id);
    const digest = measured.get(memberId);
    if (!digest) {
      throw new Error(`missing measured bundle member: ${memberId}`);
    }
    member.member.tree_digest = digest;
  }
  return resolved;
}

export function validateManifestDigests(manifest) {
  if (manifest.bundle_digest_algorithm !== BUNDLE_DIGEST_ALGORITHM) {
    throw new Error('unexpected bundle digest algorithm');
  }
  if (manifest.manifest_contract_digest_algorithm !== MANIFEST_CONTRACT_DIGEST_ALGORITHM) {
    throw new Error('unexpected manifest contract digest algorithm');
  }
  const contractDigest = manifestContractDigest(manifest);
  if (contractDigest !== manifest.manifest_contract_digest) {
    throw new Error(
      `manifest contract digest mismatch: expected ${manifest.manifest_contract_digest}, computed ${contractDigest}`,
    );
  }
  const members = listManifestMembers(manifest);
  if (members.length === 0) {
    throw new Error('bundle manifest has no members');
  }
  for (const member of members) {
    assertMemberId(member.member_id);
    if (member.tree_digest_algorithm !== TREE_DIGEST_ALGORITHM) {
      throw new Error(`unexpected tree digest algorithm for ${member.member_id}`);
    }
    if (!/^[a-f0-9]{64}$/.test(member.tree_digest ?? '')) {
      throw new Error(`missing or invalid tree digest for ${member.member_id}`);
    }
  }
  const computed = bundleDigest(members, contractDigest);
  if (computed !== manifest.bundle_digest) {
    throw new Error(
      `bundle digest mismatch: expected ${manifest.bundle_digest}, computed ${computed}`,
    );
  }
  return members;
}

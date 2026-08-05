#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  listManifestMembers,
  readJson,
  treeDigest,
  validateManifestDigests,
} from './af-skills-bundle-support.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = path.join(
  ROOT,
  'tests',
  'skills',
  'adk24',
  'capability-inventory.json',
);
const MATRIX_PATH = path.join(
  ROOT,
  'tests',
  'skills',
  'adk24',
  'experiment-matrix.json',
);
const PROBE_PATH = path.join(
  ROOT,
  'tests',
  'skills',
  'adk24',
  'capability_probe.py',
);
const MANIFEST_PATH = path.join(
  ROOT,
  '.agents',
  'skills',
  'af-skills-vnext-manifest.json',
);

const REQUIRED_CAPABILITY_FIELDS = [
  'capability_id',
  'family',
  'framework_symbols',
  'docs_evidence',
  'google_skill_evidence',
  'af_surface',
  'offline_class',
  'risk',
  'experiment_ids',
  'status',
];
const CLOSED_STATUSES = new Set([
  'confirmed',
  'corrected',
  'unsupported',
  'blocked',
  'excluded_cloud',
]);
const REQUIRED_GROUPS = {
  A: ['agent_topology', 'workflow_agent'],
  B: ['graph_workflow'],
  C: ['tool_invocation'],
  D: ['state_session_event', 'artifact_memory'],
  E: ['callback_plugin_guardrail'],
  F: ['pause_resume_failure'],
  G: ['reuse_protocol'],
  H: ['model_schema'],
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function unique(items, label) {
  const seen = new Set();
  for (const item of items) {
    assert(!seen.has(item), `duplicate ${label}: ${item}`);
    seen.add(item);
  }
}

function existingLocator(locator) {
  const filePart = locator.split('::', 1)[0].split('#', 1)[0];
  return fs.existsSync(path.resolve(ROOT, filePart));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 24 * 1024 * 1024,
    timeout: 60_000,
    ...options,
  });
  assert(!result.error, `${command} failed to start: ${result.error?.message}`);
  assert(
    result.status === 0,
    `${command} ${args.join(' ')} failed (${result.status}): ${(result.stderr || result.stdout).slice(0, 2000)}`,
  );
  return result;
}

function validateCompatibility(manifest, matrix, inventory) {
  const compatibility = manifest.compatibility;
  assert(compatibility.status === 'compatible_with_corrections', 'compatibility verdict drift');
  assert(compatibility.candidate_agents_cli === '1.3.1', 'candidate CLI must remain 1.3.1');
  assert(compatibility.accepted_agents_cli === '1.2.1', 'accepted CLI must remain 1.2.1');
  assert(compatibility.google_adk === '2.4.0', 'exact ADK baseline drift');
  assert(
    compatibility.google_adk_requirement === 'google-adk[a2a,mcp]>=2.4.0,<2.5.0',
    'supported ADK requirement drift',
  );
  assert(compatibility.mcp === '1.28.1', 'exact MCP baseline drift');
  assert(compatibility.a2a_sdk === '0.3.26', 'exact A2A SDK baseline drift');

  const requirements = fs.readFileSync(path.join(ROOT, 'requirements', 'adk-runtime.txt'), 'utf8');
  assert(
    requirements.split(/\r?\n/).includes('google-adk[a2a,mcp]>=2.4.0,<2.5.0'),
    'requirements/adk-runtime.txt no longer pins the supported 2.4 line',
  );

  const cliVersion = run('agents-cli', ['--version']).stdout.trim();
  assert(/\b1\.2\.1\b/.test(cliVersion), `unexpected agents-cli version: ${cliVersion}`);
  const info = JSON.parse(run('agents-cli', ['info', '--json']).stdout);
  assert(info.cli_version === '1.2.1', 'agents-cli info version mismatch');
  assert(Array.isArray(info.installed_skills), 'agents-cli info installed_skills shape drift');

  const python =
    process.env.AF_TEST_PYTHON || matrix.direct_probe_command.trim().split(/\s+/, 1)[0];
  assert(fs.existsSync(python), `exact ADK interpreter is missing: ${python}`);
  const packageProbe = run(python, [
    '-c',
    [
      'import importlib.metadata as m, json, sys',
      'print(json.dumps({"python": sys.executable, "google_adk": m.version("google-adk"), "mcp": m.version("mcp"), "a2a_sdk": m.version("a2a-sdk")}))',
    ].join(';'),
  ]);
  const versions = JSON.parse(packageProbe.stdout);
  assert(versions.google_adk === '2.4.0', 'selected interpreter is not exact ADK 2.4.0');
  assert(versions.mcp === '1.28.1', 'selected interpreter MCP version drift');
  assert(versions.a2a_sdk === '0.3.26', 'selected interpreter A2A SDK version drift');

  for (const googleSkill of manifest.required_google_skills) {
    const skillPath = path.resolve(googleSkill.source_path);
    const skillText = fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf8');
    assert(
      new RegExp(`version:\\s*${googleSkill.version.replaceAll('.', '\\.')}`).test(skillText),
      `${googleSkill.skill_id} metadata version drift`,
    );
    assert(
      treeDigest(skillPath) === googleSkill.tree_digest,
      `${googleSkill.skill_id} installed digest drift`,
    );
    const evidence = inventory.evidence_catalog[
      `google-${googleSkill.skill_id.replace('google-agents-cli-', '')}`
    ];
    assert(evidence, `missing inventory evidence for ${googleSkill.skill_id}`);
    assert(evidence.digest === googleSkill.tree_digest, `${googleSkill.skill_id} evidence digest drift`);
  }
}

function validateInventory(inventory, matrix) {
  assert(inventory.schema_version === 1, 'unsupported capability inventory schema');
  assert(inventory.framework_version === '2.4.0', 'inventory framework baseline drift');
  assert(inventory.capabilities.length >= 70, 'capability inventory regressed below Session 1 breadth');
  assert(
    JSON.stringify(inventory.evidence_precedence) ===
      JSON.stringify([
        'exact_runtime_probe',
        'exact_installed_source_signature_validator',
        'adk_docs_mcp',
        'installed_google_skill',
        'af_reference_and_generator',
      ]),
    'framework evidence precedence drift',
  );

  const experiments = new Map(matrix.experiments.map((item) => [item.experiment_id, item]));
  unique(inventory.capabilities.map((item) => item.capability_id), 'capability id');
  for (const capability of inventory.capabilities) {
    for (const field of REQUIRED_CAPABILITY_FIELDS) {
      assert(Object.hasOwn(capability, field), `${capability.capability_id} missing ${field}`);
    }
    assert(CLOSED_STATUSES.has(capability.status), `${capability.capability_id} is not closed`);
    assert(['high', 'medium', 'low'].includes(capability.risk), `${capability.capability_id} risk drift`);
    for (const field of [
      'framework_symbols',
      'docs_evidence',
      'google_skill_evidence',
      'af_surface',
      'experiment_ids',
    ]) {
      assert(Array.isArray(capability[field]) && capability[field].length > 0, `${capability.capability_id} empty ${field}`);
    }
    for (const evidenceId of capability.docs_evidence) {
      assert(inventory.evidence_catalog[evidenceId], `${capability.capability_id} unknown docs evidence ${evidenceId}`);
    }
    for (const evidenceId of capability.google_skill_evidence) {
      assert(inventory.evidence_catalog[evidenceId], `${capability.capability_id} unknown Google evidence ${evidenceId}`);
    }
    for (const locator of capability.af_surface) {
      assert(existingLocator(locator), `${capability.capability_id} missing AF surface ${locator}`);
    }
    for (const experimentId of capability.experiment_ids) {
      assert(experiments.has(experimentId), `${capability.capability_id} unknown experiment ${experimentId}`);
    }
    if (capability.status === 'blocked') {
      assert(capability.blocker, `${capability.capability_id} blocked without evidence-backed blocker`);
    }

    if (
      capability.risk === 'high' &&
      ['required', 'optional_local'].includes(capability.offline_class) &&
      ['confirmed', 'corrected'].includes(capability.status)
    ) {
      const linked = capability.experiment_ids.map((id) => experiments.get(id));
      assert(
        linked.some((item) => item.runner === 'capability_probe' && item.status === 'passed'),
        `${capability.capability_id} lacks representative exact-runtime evidence`,
      );
      assert(
        linked.some((item) => ['interaction', 'compound'].includes(item.kind) && item.status === 'passed'),
        `${capability.capability_id} lacks interaction or compound evidence`,
      );
    }
  }

  const docsEntries = Object.values(inventory.evidence_catalog).filter(
    (entry) => entry.transport === 'ADK Docs MCP',
  );
  assert(docsEntries.length >= 15, 'ADK Docs MCP evidence breadth regressed');
  assert(
    docsEntries.every((entry) => entry.checked_at === '2026-08-05'),
    'ADK Docs MCP evidence checked date drift',
  );

  const gapCandidates = inventory.capabilities.filter(
    (item) =>
      ['high', 'medium'].includes(item.risk) && ['blocked', 'unsupported'].includes(item.status),
  );
  const acceptedGaps = inventory.gap_baseline?.accepted_high_medium_gaps;
  assert(
    inventory.gap_baseline?.checked_at === '2026-08-05',
    'high/medium gap baseline checked date drift',
  );
  assert(Array.isArray(acceptedGaps), 'high/medium gap baseline is missing');
  unique(acceptedGaps.map((item) => item.capability_id), 'accepted high/medium gap');
  const candidateIds = new Set(gapCandidates.map((item) => item.capability_id));
  for (const accepted of acceptedGaps) {
    assert(
      candidateIds.has(accepted.capability_id),
      `accepted gap is not a current high/medium blocked or unsupported row: ${accepted.capability_id}`,
    );
    assert(
      typeof accepted.disposition === 'string' && accepted.disposition.length > 0,
      `${accepted.capability_id} missing accepted gap disposition`,
    );
    assert(
      typeof accepted.reason === 'string' && accepted.reason.length > 0,
      `${accepted.capability_id} missing accepted gap reason`,
    );
  }
  const acceptedIds = new Set(acceptedGaps.map((item) => item.capability_id));
  const newGapIds = gapCandidates
    .map((item) => item.capability_id)
    .filter((capabilityId) => !acceptedIds.has(capabilityId))
    .sort();
  assert(
    newGapIds.length === 0,
    `unaccepted high/medium capability gaps: ${newGapIds.join(', ')}`,
  );
  return {
    accepted_ids: [...acceptedIds].sort(),
    new_ids: newGapIds,
  };
}

function validateMatrix(matrix) {
  assert(matrix.schema_version === 1, 'unsupported experiment matrix schema');
  assert(matrix.network_contract.startsWith('No Internet.'), 'network prohibition missing');
  assert(matrix.model_contract.includes('no cloud or local generative model'), 'model isolation drift');
  unique(matrix.experiments.map((item) => item.experiment_id), 'experiment id');
  const experimentMap = new Map(matrix.experiments.map((item) => [item.experiment_id, item]));
  for (const experiment of matrix.experiments) {
    assert(experiment.claim, `${experiment.experiment_id} missing claim`);
    assert(
      ['passed', 'blocked', 'excluded_cloud'].includes(experiment.status),
      `${experiment.experiment_id} has open status ${experiment.status}`,
    );
    if (experiment.status === 'blocked') {
      assert(experiment.blocker, `${experiment.experiment_id} blocked without blocker`);
      assert(experiment.kind === 'small_model_forward', `${experiment.experiment_id} unexpected blocker class`);
    }
    for (const evidenceId of experiment.evidence_ids ?? []) {
      assert(experimentMap.has(evidenceId), `${experiment.experiment_id} unknown evidence ${evidenceId}`);
    }
  }

  const registered = [...fs.readFileSync(PROBE_PATH, 'utf8').matchAll(/@case\("([^"]+)"\)/g)].map(
    (match) => match[1],
  );
  const runtimeIds = matrix.experiments
    .filter((item) => item.runner === 'capability_probe')
    .map((item) => item.experiment_id);
  unique(registered, 'registered runtime case');
  assert(
    JSON.stringify([...registered].sort()) === JSON.stringify([...runtimeIds].sort()),
    'capability probe registrations and matrix runtime cases differ',
  );

  for (const [group, families] of Object.entries(REQUIRED_GROUPS)) {
    const items = matrix.experiments.filter(
      (item) => families.includes(item.family) && item.status === 'passed',
    );
    assert(
      items.some((item) => item.kind === 'positive' || /-P[0-9]+$/.test(item.experiment_id)),
      `required group ${group} lacks positive evidence`,
    );
    assert(
      items.some((item) => item.kind === 'negative' || /-N[0-9]+$/.test(item.experiment_id)),
      `required group ${group} lacks negative/failure evidence`,
    );
  }
  assert(
    matrix.experiments.filter((item) => item.kind === 'compound' && item.status === 'passed').length >= 5,
    'fewer than five compound topologies',
  );
  assert(
    matrix.experiments.filter((item) => item.kind === 'source_comparison' && item.status === 'passed').length >= 5,
    'fewer than five source-comparison probes',
  );
  const smallModel = matrix.experiments.filter((item) => item.kind === 'small_model_forward');
  assert(smallModel.length >= 4, 'small-model blocked coverage regressed');
  assert(smallModel.every((item) => item.status === 'blocked'), 'absent small model represented as PASS');
}

function validateSkillsAndManifest(manifest) {
  assert(!fs.readFileSync(MANIFEST_PATH, 'utf8').includes('PENDING'), 'manifest contains PENDING');
  assert(manifest.schema_version === 1, 'unsupported AF Skills manifest schema');
  assert(manifest.bundle_id === 'af-skills-vnext', 'unexpected AF Skills bundle id');
  assert(manifest.compatibility.status === 'compatible_with_corrections', 'manifest verdict drift');
  assert(manifest.model_profile.forward_test_status === 'blocked', 'small-model status drift');
  assert(manifest.model_profile.external_model_fallback === false, 'external model fallback enabled');
  assert(manifest.model_profile.cloud_model === false, 'cloud model enabled');
  assert(manifest.distribution.mode === 'offline_user_scoped', 'bundle is not user-scoped offline');
  assert(manifest.distribution.online_install === false, 'online install enabled');
  assert(
    manifest.architecture_decision.status === 'retained_after_evidence_audit',
    'AF Skill architecture decision missing',
  );
  validateManifestDigests(manifest);

  const manifestIds = manifest.af_skills.map((skill) => skill.skill_id).sort();
  const actualIds = fs
    .readdirSync(path.join(ROOT, '.agents', 'skills'), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith('af-') &&
        fs.existsSync(path.join(ROOT, '.agents', 'skills', entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort();
  assert(JSON.stringify(manifestIds) === JSON.stringify(actualIds), 'manifest AF Skill membership drift');
  unique(manifest.af_skills.map((skill) => skill.primary_intent.toLowerCase()), 'primary intent');
  const googleIds = new Set(manifest.required_google_skills.map((skill) => skill.skill_id));
  for (const skill of manifest.af_skills) {
    assert(skill.inputs.length > 0 && skill.outputs.length > 0, `${skill.skill_id} missing I/O contract`);
    for (const googleId of skill.required_google_skills) {
      assert(googleIds.has(googleId), `${skill.skill_id} references unpinned Google Skill ${googleId}`);
    }
    const skillPath = path.join(ROOT, skill.source_path, 'SKILL.md');
    const text = fs.readFileSync(skillPath, 'utf8');
    const lines = text.split(/\r?\n/).length;
    assert(lines < 500, `${skill.skill_id}/SKILL.md exceeds 500 lines (${lines})`);
    assert(new RegExp(`^name:\\s*${skill.skill_id}$`, 'm').test(text), `${skill.skill_id} frontmatter drift`);
  }
  assert(
    manifest.support_trees.some((item) => item.member_id === '_shared'),
    'AF shared references are absent from the offline bundle',
  );
  for (const member of listManifestMembers(manifest)) {
    const source = path.isAbsolute(member.source_path)
      ? member.source_path
      : path.resolve(ROOT, member.source_path);
    assert(treeDigest(source) === member.tree_digest, `${member.member_id} source digest drift`);
  }

  const cardAssertions = [
    ['.agents/skills/_shared/source-of-truth.md', 'Execution and validators in the exact installed'],
    ['.agents/skills/_shared/adk/graph-and-dynamic-workflows.md', 'executes once for every predecessor trigger'],
    ['.agents/skills/_shared/adk/agents-workflows-tools.md', 'does not enforce it at construction'],
    ['.agents/skills/_shared/adk/human-input-and-resume.md', 'response={"result": answer}'],
    ['.agents/skills/_shared/adk/function-and-mcp-tools.md', '`mcp 1.28.1`'],
    ['.agents/skills/_shared/adk/event-loop.md', 'no public `Runner.cancel_async`'],
  ];
  for (const [relative, fragment] of cardAssertions) {
    assert(
      fs.readFileSync(path.join(ROOT, relative), 'utf8').includes(fragment),
      `inventory correction missing from ${relative}`,
    );
  }
}

function runRuntime(matrix) {
  const python =
    process.env.AF_TEST_PYTHON || matrix.direct_probe_command.trim().split(/\s+/, 1)[0];
  const result = run(python, [PROBE_PATH]);
  const report = JSON.parse(result.stdout);
  const expectedIds = matrix.experiments
    .filter((item) => item.runner === 'capability_probe')
    .map((item) => item.experiment_id)
    .sort();
  const actualIds = report.results.map((item) => item.experiment_id).sort();
  assert(report.runtime.google_adk === '2.4.0', 'runtime report ADK drift');
  assert(report.runtime.network === 'localhost-only', 'runtime network contract drift');
  assert(report.runtime.cloud_model === false, 'runtime used a cloud model');
  assert(JSON.stringify(actualIds) === JSON.stringify(expectedIds), 'runtime report case set drift');
  assert(report.summary.failed === 0, `${report.summary.failed} runtime probes failed`);
  assert(report.summary.passed === expectedIds.length, 'runtime pass count drift');
  return report.summary;
}

function coverageSummary(inventory, matrix, manifest, runtimeSummary, gapSummary) {
  const statusCounts = Object.fromEntries(
    [...CLOSED_STATUSES].map((status) => [
      status,
      inventory.capabilities.filter((item) => item.status === status).length,
    ]),
  );
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        capabilities: inventory.capabilities.map((item) => [
          item.capability_id,
          item.status,
          item.experiment_ids,
        ]),
        experiments: matrix.experiments.map((item) => [item.experiment_id, item.status]),
        accepted_high_medium_gaps: inventory.gap_baseline.accepted_high_medium_gaps.map(
          (item) => [item.capability_id, item.disposition],
        ),
        bundle_digest: manifest.bundle_digest,
      }),
    )
    .digest('hex');
  return {
    capabilities: inventory.capabilities.length,
    capability_status: statusCounts,
    runtime_cases: matrix.experiments.filter((item) => item.runner === 'capability_probe').length,
    runtime_result: runtimeSummary ?? 'not_requested',
    interactions: matrix.experiments.filter((item) => item.kind === 'interaction').length,
    compounds: matrix.experiments.filter((item) => item.kind === 'compound').length,
    source_comparisons: matrix.experiments.filter((item) => item.kind === 'source_comparison').length,
    blocked_small_model: matrix.experiments.filter(
      (item) => item.kind === 'small_model_forward' && item.status === 'blocked',
    ).length,
    bundle_members: listManifestMembers(manifest).length,
    bundle_digest: manifest.bundle_digest,
    coverage_fingerprint: fingerprint,
    accepted_high_medium_gaps: gapSummary.accepted_ids.length,
    new_high_medium_gap_ids: gapSummary.new_ids,
    new_high_medium_gaps: gapSummary.new_ids.length,
  };
}

try {
  const options = new Set(process.argv.slice(2));
  for (const option of options) {
    assert(['--runtime', '--audit'].includes(option), `unknown option: ${option}`);
  }
  const inventory = readJson(INVENTORY_PATH);
  const matrix = readJson(MATRIX_PATH);
  const manifest = readJson(MANIFEST_PATH);
  validateMatrix(matrix);
  const gapSummary = validateInventory(inventory, matrix);
  validateSkillsAndManifest(manifest);
  validateCompatibility(manifest, matrix, inventory);
  const runtimeSummary = options.has('--runtime') ? runRuntime(matrix) : null;
  const summary = coverageSummary(inventory, matrix, manifest, runtimeSummary, gapSummary);
  if (options.has('--audit')) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(
      `AF Skills vNext validation passed: ${summary.capabilities} capabilities, ${summary.runtime_cases} runtime cases, ${summary.bundle_members} bundle members\n`,
    );
  }
} catch (error) {
  process.stderr.write(
    `AF Skills vNext validation failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

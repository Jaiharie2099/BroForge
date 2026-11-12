import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
const sha = data => createHash('sha256').update(data).digest('hex');

// A private module copy supplies the parent's workspace contract without modifying
// project sources or consulting the user's game/Steam installation.
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broforce-ownership-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), game = path.join(root, 'game', 'Levels');
  await fs.mkdir(workspace, { recursive: true }); await fs.mkdir(game, { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.copyFile(new URL('../src/ownership.js', import.meta.url), path.join(root, 'ownership.js'));
  await fs.writeFile(path.join(root, 'workspace.js'), `import path from 'node:path'; export const WORKSPACE = process.env.BROFORCE_WORKSPACE; export const STATE = path.join(WORKSPACE, '.broforge');`);
  const previous = process.env.BROFORCE_WORKSPACE;
  process.env.BROFORCE_WORKSPACE = workspace;
  let api;
  try { api = await import(pathToFileURL(path.join(root, 'ownership.js'))); }
  finally { if (previous === undefined) delete process.env.BROFORCE_WORKSPACE; else process.env.BROFORCE_WORKSPACE = previous; }
  const runtime = path.join(workspace, '.broforge', 'runtime');
  return { ...api, root, workspace, game, runtime, target: name => path.join(game, name), ledger: path.join(runtime, 'ownership.json') };
}
const contents = file => fs.readFile(file, 'utf8');

test('new, overwritten, and identical files retain original contents and modes across updates', async t => {
  const f = await fixture(t), a = f.target('a'), b = f.target('b'), c = f.target('c');
  await fs.writeFile(b, 'original', { mode: 0o640 }); await fs.writeFile(c, 'identical');
  assert.throws(() => f.installFiles('one', [{ path: b, data: 'new' }]), /overwrite/);
  const installed = f.installFiles('one', [{ path: a, data: Buffer.from('new') }, { path: b, data: 'new' }, { path: c, data: 'identical' }], { overwrite: true });
  assert.equal(installed.transactionId, JSON.parse(await contents(f.ledger)).owners.one.transactionId);
  assert.equal(f.inventory().entries.length, 3);
  f.installFiles('one', [{ path: b, data: 'updated' }]);
  await assert.rejects(fs.stat(a), { code: 'ENOENT' }); assert.equal(await contents(c), 'identical');
  f.uninstallOwner('one'); assert.equal(await contents(b), 'original');
  assert.equal((await fs.stat(b)).mode & 0o777, 0o640); assert.deepEqual(f.inventory().entries, []);
});

test('all conflicts are preflighted and stale plans cannot remove anything', async t => {
  const f = await fixture(t), a = f.target('a'), b = f.target('b');
  f.installFiles('one', [{ path: a, data: 'a' }, { path: b, data: 'b' }]);
  const initial = f.planRemoval({ includeAll: true });
  await fs.writeFile(b, 'edited');
  assert.throws(() => f.applyRemoval({ planId: initial.planId, includeAll: true }), /plan changed/);
  const conflicted = f.planRemoval({ includeAll: true }); assert.equal(conflicted.conflicts.length, 1);
  assert.throws(() => f.applyRemoval({ planId: conflicted.planId, includeAll: true }), /conflicts/);
  assert.equal(await contents(a), 'a'); assert.equal(await contents(b), 'edited');
  assert.throws(() => f.installFiles('one', [{ path: a, data: 'updated' }]), /changed/);
  assert.equal(await contents(a), 'a');
});

test('ownership overlap and source copies are validated before writes', async t => {
  const f = await fixture(t), a = f.target('a'), b = f.target('b'), source = path.join(f.root, 'source');
  await fs.writeFile(source, 'source', { mode: 0o750 });
  f.installFiles('one', [{ path: a, source }]); assert.equal(await contents(a), 'source');
  assert.equal((await fs.stat(a)).mode & 0o777, 0o750);
  assert.throws(() => f.installFiles('two', [{ path: b, data: 'b' }, { path: a, data: 'a' }]), /Overlapping/);
  await assert.rejects(fs.stat(b), { code: 'ENOENT' });
  assert.throws(() => f.installFiles('two', [{ path: b, source: path.join(f.root, 'missing') }]), /Missing source/);
});

test('symlinks in targets, ancestors, sources, backups and temporary files are refused', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside'); await fs.writeFile(outside, 'safe');
  await fs.symlink(outside, f.target('link'));
  assert.throws(() => f.installFiles('one', [{ path: f.target('link'), data: 'bad' }]), /Symlink/);
  await fs.symlink(f.game, path.join(f.root, 'alias'));
  assert.throws(() => f.installFiles('one', [{ path: path.join(f.root, 'alias', 'x'), data: 'bad' }]), /Symlink/);
  assert.throws(() => f.installFiles('one', [{ path: f.target('x'), source: f.target('link') }]), /Symlink/);
  await fs.symlink(outside, f.target('x') + '.tmp');
  assert.throws(() => f.installFiles('one', [{ path: f.target('x'), data: 'bad' }]), /Symlink/);
  assert.equal(await contents(outside), 'safe');
  await fs.unlink(f.target('x') + '.tmp');
  await fs.writeFile(f.target('x'), 'original');
  const item = f.installFiles('one', [{ path: f.target('x'), data: 'tool' }], { overwrite: true }).files[0];
  await fs.unlink(item.backup); await fs.symlink(outside, item.backup);
  assert.equal(f.planRemoval({ includeAll: true }).conflicts.length, 1);
  assert.throws(() => f.uninstallOwner('one'), /conflicts/); assert.equal(await contents(f.target('x')), 'tool');
});

test('missing and corrupt backups block the entire removal', async t => {
  for (const corrupt of [false, true]) {
    const f = await fixture(t), a = f.target('a'), b = f.target('b');
    await fs.writeFile(b, 'original');
    const receipt = f.installFiles('one', [{ path: a, data: 'a' }, { path: b, data: 'b' }], { overwrite: true });
    const backup = receipt.files[1].backup;
    if (corrupt) await fs.writeFile(backup, 'corrupt'); else await fs.unlink(backup);
    assert.throws(() => f.uninstallOwner('one'), /conflicts/); assert.equal(await contents(a), 'a');
  }
});

test('durable pending writes recover in a new process, refusing unrelated edits', async t => {
  const f = await fixture(t), a = f.target('a');
  f.installFiles('one', [{ path: a, data: 'old' }]);
  const ledger = JSON.parse(await contents(f.ledger));
  const oldHash = sha('old'), backup = path.join(f.runtime, 'backups', oldHash);
  await fs.writeFile(backup, 'old');
  ledger.pending = { transactionId: 'interrupted', before: [{ path: a, sha256: oldHash, mode: 0o644, backup }], after: [{ path: a, sha256: sha('new'), mode: 0o644 }] };
  await fs.writeFile(f.ledger, JSON.stringify(ledger)); await fs.writeFile(a, 'new');
  const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', `import { inventory } from ${JSON.stringify(pathToFileURL(path.join(f.root, 'ownership.js')).href)}; inventory();`], { env: { ...process.env, BROFORCE_WORKSPACE: f.workspace }, encoding: 'utf8' });
  assert.equal(run().status, 0); assert.equal(await contents(a), 'old');
  assert.equal(JSON.parse(await contents(f.ledger)).pending, null);
  await fs.writeFile(f.ledger, JSON.stringify(ledger)); await fs.writeFile(a, 'unrelated');
  const blocked = run(); assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /Recovery conflict/); assert.equal(await contents(a), 'unrelated');
});

test('ledger corruption, workspace mismatch, journal symlinks and active locks fail closed', async t => {
  const f = await fixture(t); f.installFiles('one', []);
  const original = await contents(f.ledger);
  await fs.writeFile(f.ledger, '{'); assert.throws(() => f.inventory(), /Corrupt/);
  const ledger = JSON.parse(original); ledger.workspace.path = '/wrong';
  await fs.writeFile(f.ledger, JSON.stringify(ledger)); assert.throws(() => f.inventory(), /identity/);
  await fs.writeFile(f.ledger, original);
  await fs.writeFile(path.join(f.runtime, 'ownership.lock'), String(process.pid)); assert.throws(() => f.inventory(), /locked/);
  await fs.unlink(path.join(f.runtime, 'ownership.lock'));
  await fs.symlink(f.target('irrelevant'), f.ledger + '.tmp'); assert.throws(() => f.installFiles('two', []), /Symlink/);
});

test('local capture tracks changed, created and deleted files, preserving the first baseline', async t => {
  const f = await fixture(t), root = path.join(f.workspace, '.broforge', '.toolchain');
  await fs.mkdir(root, { recursive: true }); const original = path.join(root, 'original'), deleted = path.join(root, 'deleted'), added = path.join(root, 'added'), untouched = path.join(root, 'untouched');
  await fs.writeFile(original, 'original', { mode: 0o640 }); await fs.writeFile(deleted, 'deleted'); await fs.writeFile(untouched, 'untouched');
  const receipt = await f.captureLocalFiles('runtime:setup', [root], async () => {
    await fs.writeFile(original, 'v1'); await fs.unlink(deleted); await fs.writeFile(added, 'download'); return 'result';
  });
  assert.equal(receipt.result, 'result'); assert.equal(receipt.files.length, 3);
  const firstBackup = receipt.files.find(item => item.path === original).backup;
  await f.captureLocalFiles('runtime:setup', [root], async () => { await fs.writeFile(original, 'v2'); });
  assert.equal(f.inventory().entries.find(item => item.path === original).backup, firstBackup);
  const blobs = await fs.readdir(path.join(f.runtime, 'backups'));
  assert.ok(!blobs.includes(sha('v1')), 'owned baseline must not be backed up again');
  f.uninstallOwner('runtime:setup');
  assert.equal(await contents(original), 'original'); assert.equal((await fs.stat(original)).mode & 0o777, 0o640);
  assert.equal(await contents(deleted), 'deleted'); assert.equal(await contents(untouched), 'untouched');
  await assert.rejects(fs.stat(added), { code: 'ENOENT' });
});

test('failed local setup records partial downloads and refuses unsafe roots and ownership', async t => {
  const f = await fixture(t), root = path.join(f.workspace, '.broforge', 'dependencies'); await fs.mkdir(root, { recursive: true });
  let invoked = false;
  await assert.rejects(async () => f.captureLocalFiles('setup', [f.game], () => { invoked = true; }), /Unsafe/);
  await assert.rejects(async () => f.captureLocalFiles('setup', [f.runtime], () => { invoked = true; }), /Unsafe/);
  assert.equal(invoked, false);
  const file = path.join(root, 'partial');
  await assert.rejects(f.captureLocalFiles('setup', [root], async () => { await fs.writeFile(file, 'partial'); throw new Error('download failed'); }), /download failed/);
  assert.equal(f.inventory().entries.length, 1);
  await assert.rejects(f.captureLocalFiles('other', [root], () => {}), /Overlapping/);
  f.uninstallOwner('setup'); await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  await fs.symlink(f.game, path.join(root, 'link'));
  await assert.rejects(f.captureLocalFiles('setup', [root], () => {}), /Symlink/);
});

test('interrupted local capture finalizes after-state and clears a dead process lock', async t => {
  const f = await fixture(t), root = path.join(f.workspace, '.broforge', 'dependencies'); await fs.mkdir(root, { recursive: true });
  const file = path.join(root, 'partial');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import fs from 'node:fs'; import {captureLocalFiles} from ${JSON.stringify(pathToFileURL(path.join(f.root, 'ownership.js')).href)}; await captureLocalFiles('setup', [${JSON.stringify(root)}], () => { fs.writeFileSync(${JSON.stringify(file)}, 'partial'); process.exit(23); });`], { env: { ...process.env, BROFORCE_WORKSPACE: f.workspace }, encoding: 'utf8' });
  assert.equal(child.status, 23, child.stderr);
  assert.equal(JSON.parse(await contents(f.ledger)).pending.capture, true);
  assert.equal(f.inventory().entries.length, 1);
  f.uninstallOwner('setup'); await assert.rejects(fs.stat(file), { code: 'ENOENT' });
});

test('mid-install failure rolls back every changed target and keeps prior ownership', async t => {
  const f = await fixture(t), a = f.target('a'), b = f.target('b');
  f.installFiles('one', [{ path: a, data: 'original installed' }]);
  const outside = path.join(f.root, 'outside'); await fs.writeFile(outside, 'untouched');
  await fs.symlink(outside, b + '.tmp');
  assert.throws(() => f.installFiles('one', [{ path: a, data: 'changed' }, { path: b, data: 'new' }]), /Symlink/);
  assert.equal(await contents(a), 'original installed'); assert.equal(await contents(outside), 'untouched');
  await assert.rejects(fs.stat(b), { code: 'ENOENT' });
  assert.equal(f.inventory().entries[0].sha256, sha('original installed'));
  assert.equal(JSON.parse(await contents(f.ledger)).pending, null);
});

test('backup corruption or a mode change after planning invalidates approval', async t => {
  const f = await fixture(t), a = f.target('a'); await fs.writeFile(a, 'original');
  const receipt = f.installFiles('one', [{ path: a, data: 'tool' }], { overwrite: true });
  const preview = f.planRemoval({ owners: ['one'] });
  await fs.chmod(a, 0o700);
  assert.throws(() => f.applyRemoval({ owners: ['one'], planId: preview.planId }), /plan changed/);
  await fs.chmod(a, receipt.files[0].mode);
  await fs.writeFile(receipt.files[0].backup, 'damaged');
  assert.throws(() => f.applyRemoval({ owners: ['one'], planId: preview.planId }), /plan changed/);
  assert.equal(await contents(a), 'tool');
});

test('setup captures the requested three STATE subdirectories without capturing journal metadata', async t => {
  const f = await fixture(t), state = path.join(f.workspace, '.broforge');
  const roots = [path.join(state, '.toolchain'), path.join(state, 'dependencies'), path.join(state, 'runtime', 'profile')];
  const receipt = await f.captureLocalFiles('runtime:setup', roots, async () => {
    for (const root of roots) { await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, 'payload'), 'setup'); }
  });
  assert.equal(receipt.files.length, 3);
  assert.equal(f.inventory().entries.length, 3);
  const preview = f.planRemoval({ includeAll: true }); assert.deepEqual(preview.conflicts, []);
  f.applyRemoval({ includeAll: true, planId: preview.planId });
  for (const root of roots) await assert.rejects(fs.stat(path.join(root, 'payload')), { code: 'ENOENT' });
  assert.ok(await fs.stat(f.ledger));
});

test('setup refresh excludes project ownership, mutable names, and prefixes without claiming unchanged files', async t => {
  const f = await fixture(t), profile = path.join(f.runtime, 'profile'), project = path.join(profile, 'projects', 'one');
  const projectFile = path.join(project, 'hero.dll'), payload = path.join(profile, 'runtime.dll');
  f.installFiles('project:one', [{ path: projectFile, data: 'project' }]);
  const ipc = path.join(profile, 'ipc'), config = path.join(profile, 'UMM', 'Config'), policy = path.join(profile, 'campaign-policies.json');
  const options = { excludePaths: [ipc, project, config, policy], excludeNames: ['Log.txt', 'Player.log', 'Settings.xml', 'Params.xml'] };
  const excludedFiles = [path.join(ipc, 'socket-state'), path.join(config, 'config'), policy, ...options.excludeNames.map(name => path.join(profile, 'nested', name))];
  for (const file of excludedFiles) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'initial'); }
  const untouched = path.join(profile, 'untouched'); await fs.writeFile(untouched, 'existing');
  const sibling = path.join(profile, 'ipc-sibling');
  await f.captureLocalFiles('runtime:setup', [profile], async () => {
    for (const file of excludedFiles) await fs.writeFile(file, 'mutable');
    await fs.writeFile(payload, 'v1'); await fs.writeFile(sibling, 'owned sibling');
  }, options);
  await f.captureLocalFiles('runtime:setup', [profile], async () => { await fs.writeFile(payload, 'v2'); }, options);
  assert.deepEqual(f.inventory().entries.filter(item => item.owner === 'runtime:setup').map(item => item.path).sort(), [payload, sibling].sort());
  assert.equal(f.inventory().entries.find(item => item.path === projectFile).owner, 'project:one');
  f.uninstallOwner('runtime:setup');
  for (const file of excludedFiles) assert.equal(await contents(file), 'mutable');
  assert.equal(await contents(projectFile), 'project'); assert.equal(await contents(untouched), 'existing');
  await assert.rejects(fs.stat(payload), { code: 'ENOENT' });
  f.uninstallOwner('project:one');
});

test('capture rejects invalid exclusions before invoking setup', async t => {
  const f = await fixture(t), root = path.join(f.runtime, 'profile'); let invoked = false;
  for (const options of [
    { excludePaths: [f.game] }, { excludePaths: ['relative'] }, { excludePaths: [path.resolve(f.workspace, '.broforge')] },
    { excludePaths: [path.join(f.workspace, '.broforge-other', 'file')] }, { excludePaths: 'invalid' },
    { excludeNames: ['nested/Log.txt'] }, { excludeNames: ['..'] }, { excludeNames: [''] }, { excludeNames: [42] },
  ]) {
    await assert.rejects(f.captureLocalFiles('setup', [root], () => { invoked = true; }, options), /Excluded|exclusions/);
  }
  assert.equal(invoked, false); assert.deepEqual(f.inventory().entries, []);
});

test('interrupted capture persists exclusions for recovery and overlap checks', async t => {
  const f = await fixture(t), root = path.join(f.runtime, 'profile'), project = path.join(root, 'project');
  const owned = path.join(project, 'hero.dll'); f.installFiles('project', [{ path: owned, data: 'hero' }]);
  const ignored = path.join(root, 'ipc'), file = path.join(root, 'download'), log = path.join(root, 'nested', 'Log.txt');
  const options = { excludePaths: [project, ignored], excludeNames: ['Log.txt'] };
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import fs from 'node:fs'; import {captureLocalFiles} from ${JSON.stringify(pathToFileURL(path.join(f.root, 'ownership.js')).href)}; await captureLocalFiles('setup', [${JSON.stringify(root)}], () => { fs.mkdirSync(${JSON.stringify(ignored)}, {recursive:true}); fs.writeFileSync(${JSON.stringify(path.join(ignored, 'state'))}, 'ignored'); fs.mkdirSync(${JSON.stringify(path.dirname(log))}, {recursive:true}); fs.writeFileSync(${JSON.stringify(log)}, 'log'); fs.writeFileSync(${JSON.stringify(file)}, 'partial'); process.exit(23); }, ${JSON.stringify(options)});`], { env: { ...process.env, BROFORCE_WORKSPACE: f.workspace }, encoding: 'utf8' });
  assert.equal(child.status, 23, child.stderr);
  assert.deepEqual(JSON.parse(await contents(f.ledger)).pending.options, { excludePaths: [...options.excludePaths].sort(), excludeNames: options.excludeNames });
  assert.deepEqual(f.inventory().entries.filter(item => item.owner === 'setup').map(item => item.path), [file]);
  f.uninstallOwner('setup'); assert.equal(await contents(log), 'log'); assert.equal(await contents(owned), 'hero');
  assert.equal(await contents(path.join(ignored, 'state')), 'ignored');
});

test('capture exclusions preserve existing ownership and do not change install or removal rules', async t => {
  const f = await fixture(t), root = path.join(f.runtime, 'profile'), log = path.join(root, 'Log.txt');
  f.installFiles('setup', [{ path: log, data: 'owned log' }]);
  const before = f.inventory().entries;
  await f.captureLocalFiles('setup', [root], async () => { await fs.writeFile(log, 'external change'); }, { excludeNames: ['Log.txt'] });
  assert.deepEqual(f.inventory().entries, before);
  assert.equal(f.planRemoval({ owners: ['setup'] }).conflicts.length, 1);
  assert.throws(() => f.uninstallOwner('setup'), /conflicts/);
  const other = path.join(root, 'Params.xml');
  f.installFiles('other', [{ path: other, data: 'owned settings' }]);
  assert.equal(f.inventory().entries.find(item => item.path === other).owner, 'other');
  f.uninstallOwner('other'); await assert.rejects(fs.stat(other), { code: 'ENOENT' });
});

// The test process owns/reaps this detached worker so process-group death can be
// asserted without relying on the container's PID 1 to reap orphan zombies.
async function gatedWriter(t, file) {
  const worker = spawn(process.execPath, ['--input-type=module', '-e', `import fs from 'node:fs'; process.stdin.once('data', data => { if (data[0] !== 49) process.exit(2); fs.writeFileSync(${JSON.stringify(file)}, 'partial'); process.stdout.write('ready'); setInterval(() => fs.appendFileSync(${JSON.stringify(file)}, '.'), 20); }); process.stdin.on('end', () => { if (!fs.existsSync(${JSON.stringify(file)})) process.exit(0); });`], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  await once(worker, 'spawn');
  const exited = once(worker, 'exit');
  let stopped = false;
  const stop = async () => {
    if (!stopped) { stopped = true; process.kill(-worker.pid, 'SIGTERM'); await exited; }
  };
  t.after(stop);
  return { worker, stop };
}

test('crashed capture supervisor cannot finalize while its registered writer group lives', async t => {
  const f = await fixture(t), root = path.join(f.runtime, 'profile'), file = path.join(root, 'download');
  await fs.mkdir(root, { recursive: true });
  const { worker, stop } = await gatedWriter(t, file);
  const supervisor = spawnSync(process.execPath, ['--input-type=module', '-e', `import fs from 'node:fs'; import {captureLocalFiles} from ${JSON.stringify(pathToFileURL(path.join(f.root, 'ownership.js')).href)}; await captureLocalFiles('setup', [${JSON.stringify(root)}], registerWriter => { registerWriter(${worker.pid}); const saved = JSON.parse(fs.readFileSync(${JSON.stringify(f.ledger)}, 'utf8')); if (saved.pending.writerProcessGroup !== ${worker.pid}) process.exit(9); process.exit(23); });`], { env: { ...process.env, BROFORCE_WORKSPACE: f.workspace }, encoding: 'utf8' });
  assert.equal(supervisor.status, 23, supervisor.stderr);
  // Registration was durable before the caller could release the worker gate.
  const ready = once(worker.stdout, 'data'); worker.stdin.end('1'); await ready;
  assert.throws(() => f.inventory(), /writer process group still alive/);
  assert.throws(() => f.planRemoval({ includeAll: true }), /writer process group still alive/);
  assert.equal(JSON.parse(await contents(f.ledger)).pending.writerProcessGroup, worker.pid);
  assert.match(await contents(file), /^partial/);
  await stop();
  assert.equal(f.inventory().entries[0].path, file);
  assert.equal(JSON.parse(await contents(f.ledger)).pending, null);
  f.uninstallOwner('setup'); await assert.rejects(fs.stat(file), { code: 'ENOENT' });
});

test('normal capture refuses a live writer, validates registration and finalizes only after group exit', async t => {
  const f = await fixture(t), root = path.join(f.runtime, 'profile'), file = path.join(root, 'download');
  await fs.mkdir(root, { recursive: true });
  const { worker, stop } = await gatedWriter(t, file);
  let lateRegister;
  await assert.rejects(f.captureLocalFiles('setup', [root], async registerWriter => {
    lateRegister = registerWriter;
    for (const invalid of [0, 1, -worker.pid, '123', NaN, 1.5, 0x80000000]) assert.throws(() => registerWriter(invalid), /Invalid writer/);
    registerWriter(worker.pid);
    assert.equal(JSON.parse(await contents(f.ledger)).pending.writerProcessGroup, worker.pid);
    const ready = once(worker.stdout, 'data'); worker.stdin.end('1'); await ready;
    return 'finished too early';
  }), /writer process group still alive/);
  assert.throws(() => lateRegister(worker.pid), /action already finished/);
  await stop();
  assert.equal(f.inventory().entries.length, 1);
  f.uninstallOwner('setup');
  const nextFile = path.join(root, 'completed');
  const next = await gatedWriter(t, nextFile);
  const receipt = await f.captureLocalFiles('setup', [root], async registerWriter => {
    registerWriter(next.worker.pid);
    const ready = once(next.worker.stdout, 'data'); next.worker.stdin.end('1'); await ready;
    await next.stop(); return 'done';
  });
  assert.equal(receipt.result, 'done'); assert.equal(receipt.files.length, 1);
  assert.equal(JSON.parse(await contents(f.ledger)).pending, null);
});

test('pruning removes SDK rollback blobs but keeps restored user originals and active backups', async t => {
  const f = await fixture(t), sdk = f.target('sdk.dll'), user = f.target('user.dll'), active = f.target('active.dll');
  await fs.writeFile(user, 'user original'); await fs.writeFile(active, 'active original');
  f.installFiles('sdk', [{ path: sdk, data: 'large SDK payload' }]);
  const userReceipt = f.installFiles('user', [{ path: user, data: 'tool replacement' }], { overwrite: true });
  const activeReceipt = f.installFiles('active', [{ path: active, data: 'active replacement' }], { overwrite: true });
  f.uninstallOwner('sdk');
  // Reconciliation, rather than just uninstall, must retain original backups.
  f.installFiles('user', []);
  assert.equal(await contents(user), 'user original');
  const sdkBlob = path.join(f.runtime, 'backups', sha('large SDK payload'));
  assert.equal(await contents(sdkBlob), 'large SDK payload');
  const pruned = f.pruneTransactionBackups(); assert.ok(pruned.removed >= 2); assert.ok(pruned.bytesRemoved > 0);
  await assert.rejects(fs.stat(sdkBlob), { code: 'ENOENT' });
  assert.equal(await contents(userReceipt.files[0].backup), 'user original');
  assert.equal(await contents(activeReceipt.files[0].backup), 'active original');
  const ledger = JSON.parse(await contents(f.ledger));
  assert.ok(ledger.retainedOriginalBackups.some(item => item.sha256 === sha('user original')));
  f.uninstallOwner('active'); f.pruneTransactionBackups();
  assert.equal(await contents(activeReceipt.files[0].backup), 'active original');
  assert.equal(f.pruneTransactionBackups().removed, 0);
});

test('pruning preserves pending snapshots without finalizing a capture and preflights symlinks', async t => {
  const f = await fixture(t), root = path.join(f.runtime, 'profile'), file = path.join(root, 'user');
  await fs.mkdir(root, { recursive: true }); await fs.writeFile(file, 'capture original');
  const supervisor = spawnSync(process.execPath, ['--input-type=module', '-e', `import {captureLocalFiles} from ${JSON.stringify(pathToFileURL(path.join(f.root, 'ownership.js')).href)}; await captureLocalFiles('setup', [${JSON.stringify(root)}], () => process.exit(23));`], { env: { ...process.env, BROFORCE_WORKSPACE: f.workspace }, encoding: 'utf8' });
  assert.equal(supervisor.status, 23, supervisor.stderr);
  const pending = JSON.parse(await contents(f.ledger)).pending;
  assert.equal(f.pruneTransactionBackups().removed, 0);
  assert.deepEqual(JSON.parse(await contents(f.ledger)).pending, pending);
  assert.equal(await contents(pending.before[0].backup), 'capture original');
  const unusedHash = sha('unused'), unused = path.join(f.runtime, 'backups', unusedHash);
  await fs.writeFile(unused, 'unused');
  await fs.symlink(file, path.join(f.runtime, 'backups', 'z-temp'));
  assert.throws(() => f.pruneTransactionBackups(), /Symlink/);
  assert.equal(await contents(unused), 'unused');
});

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { STATE, WORKSPACE } from './workspace.js';

const runtime = path.resolve(STATE, 'runtime');
const ledgerPath = path.join(runtime, 'ownership.json');
const backups = path.join(runtime, 'backups');
const lockPath = path.join(runtime, 'ownership.lock');
const hash = data => createHash('sha256').update(data).digest('hex');
const digest = value => hash(JSON.stringify(value));
const fail = message => { throw new Error(message); };

// Check every component, including dangling symlinks. Targets may be outside WORKSPACE.
function safe(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) fail(`Invalid absolute path: ${file}`);
  let cursor = path.parse(file).root;
  for (const component of file.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) fail(`Symlink refused: ${cursor}`);
    if (cursor !== file && !stat.isDirectory()) fail(`Not a directory: ${cursor}`);
  }
  return file;
}
function mkdir(dir) {
  safe(dir);
  const missing = [];
  for (let cursor = dir; !fs.existsSync(cursor); cursor = path.dirname(cursor)) missing.push(cursor);
  fs.mkdirSync(dir, { recursive: true }); safe(dir);
  for (const created of missing.reverse()) syncDir(path.dirname(created));
}
function syncDir(dir) { const fd = fs.openSync(safe(dir), 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function read(file) {
  safe(file);
  try {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) fail(`Not a regular file: ${file}`);
      const data = fs.readFileSync(fd);
      return { data, sha256: hash(data), mode: stat.mode & 0o777 };
    } finally { fs.closeSync(fd); }
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function atomic(file, data, mode = 0o600) {
  safe(file); mkdir(path.dirname(file));
  safe(`${file}.tmp`);
  const temp = `${file}.${randomUUID()}.tmp`;
  safe(temp);
  // Unique O_EXCL temporaries cannot follow existing files, including crash leftovers.
  const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, mode);
  try { fs.writeFileSync(fd, data); fs.fchmodSync(fd, mode); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { safe(file); fs.renameSync(temp, file); syncDir(path.dirname(file)); }
  catch (error) { if (fs.existsSync(temp)) fs.unlinkSync(temp); throw error; }
}
function remove(file) { safe(file); fs.unlinkSync(file); syncDir(path.dirname(file)); }
function blob(data) {
  const sha256 = hash(data), file = path.join(backups, sha256);
  const existing = read(file);
  if (existing && existing.sha256 !== sha256) fail(`Corrupt backup: ${file}`);
  if (!existing) atomic(file, data);
  return file;
}
function backupData(file, sha256) {
  if (file !== path.join(backups, sha256) || !/^[a-f0-9]{64}$/.test(sha256)) fail(`Invalid backup: ${file}`);
  const value = read(file);
  if (!value || value.sha256 !== sha256) fail(`Missing or corrupt backup: ${file}`);
  return value.data;
}
function identity() {
  safe(path.resolve(WORKSPACE));
  const stat = fs.statSync(WORKSPACE);
  return { path: path.resolve(WORKSPACE), device: String(stat.dev), inode: String(stat.ino) };
}
function validateItem(item) {
  safe(item.path);
  if (item.path === runtime || item.path === backups || item.path.startsWith(backups + path.sep) || item.path === ledgerPath || item.path.startsWith(ledgerPath + '.') || item.path === lockPath || item.path.startsWith(lockPath + '.')) fail('Cannot own journal files');
  if (!(item.sha256 === null || /^[a-f0-9]{64}$/.test(item.sha256)) || !Number.isInteger(item.mode) || item.mode < 0 || item.mode > 0o777) fail('Invalid ownership item');
  if (typeof item.existed !== 'boolean') fail('Invalid original existence');
  if (item.existed && (!item.backup || !item.backupSha256 || !Number.isInteger(item.backupMode) || item.backupMode < 0 || item.backupMode > 0o777)) fail('Invalid backup record');
  if (item.backup) backupData(item.backup, item.backupSha256);
}
function load() {
  const value = read(ledgerPath);
  if (!value) return { version: 1, workspace: identity(), owners: {}, pending: null };
  let ledger;
  try { ledger = JSON.parse(value.data); } catch { fail('Corrupt ownership ledger'); }
  if (ledger.version !== 1 || digest(ledger.workspace) !== digest(identity()) || !ledger.owners || typeof ledger.owners !== 'object' || Array.isArray(ledger.owners)) fail('Invalid ledger or workspace identity mismatch');
  const seen = new Set();
  for (const [owner, receipt] of Object.entries(ledger.owners)) {
    if (receipt.owner !== owner || !Array.isArray(receipt.files)) fail('Invalid ownership receipt');
    for (const item of receipt.files) {
      // Validate structure here; backup and target conflicts are collected by planning.
      if (!item || typeof item.path !== 'string' || !path.isAbsolute(item.path) || !(item.sha256 === null || /^[a-f0-9]{64}$/.test(item.sha256))) fail('Invalid ownership item');
      if (seen.has(item.path)) fail('Overlapping ownership in ledger');
      seen.add(item.path);
    }
  }
  return ledger;
}
function save(ledger) { atomic(ledgerPath, JSON.stringify(ledger, null, 2) + '\n'); }
function snapshot(file) {
  const current = read(file);
  return current ? { path: file, sha256: current.sha256, mode: current.mode, backup: blob(current.data) } : { path: file, sha256: null };
}
function restore(snapshot) {
  const current = read(snapshot.path);
  if ((current?.sha256 ?? null) === snapshot.sha256 && (!current || current.mode === snapshot.mode)) return;
  if (snapshot.sha256 === null) { if (current) remove(snapshot.path); }
  else atomic(snapshot.path, backupData(snapshot.backup, snapshot.sha256), snapshot.mode);
}
function recover(ledger) {
  if (!ledger.pending) return;
  if (ledger.pending.capture) { finishCapture(ledger); return; }
  const { before, after } = ledger.pending;
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) fail('Corrupt pending transaction');
  // Preflight the complete rollback before changing any file. Never erase an unrelated edit.
  before.forEach((old, index) => {
    safe(old.path);
    if (old.sha256 !== null) backupData(old.backup, old.sha256);
    const next = after[index];
    if (next.path !== old.path) fail('Corrupt pending transaction paths');
    const current = read(old.path);
    const same = state => (current?.sha256 ?? null) === state.sha256 && (!current || current.mode === state.mode);
    if (!same(old) && !same(next)) fail(`Recovery conflict: changed file ${old.path}`);
  });
  for (const old of before) restore(old);
  ledger.pending = null; save(ledger);
}
function locked(fn, { recoverPending = true } = {}) {
  mkdir(runtime); mkdir(backups);
  safe(lockPath);
  let fd;
  try { fd = fs.openSync(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const lock = read(lockPath);
    const pid = Number(lock?.data.toString());
    if (!Number.isInteger(pid) || pid <= 0) fail('Invalid ownership lock');
    try { process.kill(pid, 0); } catch (probe) {
      if (probe.code !== 'ESRCH') throw probe;
      remove(lockPath);
      return locked(fn, { recoverPending });
    }
    fail('Ownership journal is locked');
  }
  const release = () => { fs.closeSync(fd); remove(lockPath); };
  let asynchronous = false;
  try {
    fs.writeFileSync(fd, String(process.pid)); fs.fsyncSync(fd); syncDir(runtime);
    const ledger = load(); if (recoverPending) recover(ledger);
    const result = fn(ledger);
    if (result && typeof result.then === 'function') { asynchronous = true; return result.finally(release); }
    return result;
  } finally { if (!asynchronous) release(); }
}
function transact(ledger, changes, owners, transactionId = randomUUID()) {
  const before = changes.map(change => snapshot(change.path));
  const after = changes.map(change => ({ path: change.path, sha256: change.data === null ? null : hash(change.data), mode: change.mode }));
  ledger.retainedOriginalBackups = originalBackups(ledger, owners);
  ledger.pending = { transactionId, before, after }; save(ledger);
  try {
    for (const change of changes) {
      if (change.data === null) { if (read(change.path)) remove(change.path); }
      else atomic(change.path, change.data, change.mode);
    }
    const committed = { ...ledger, owners, pending: null };
    save(committed);
  } catch (error) {
    // Keep pending durable if rollback cannot safely complete; subsequent calls retry it.
    try { recover(ledger); } catch (rollback) { throw new AggregateError([error, rollback], 'Transaction failed; recovery required'); }
    throw error;
  }
  return transactionId;
}
function removal(item) {
  validateItem(item);
  const current = read(item.path);
  if ((current?.sha256 ?? null) !== item.sha256 || (current && current.mode !== item.mode)) fail(`Installed file changed: ${item.path}`);
  return { path: item.path, data: item.existed ? backupData(item.backup, item.backupSha256) : null, mode: item.backupMode, action: item.existed ? 'restore' : 'delete' };
}

export function installFiles(owner, copies, { overwrite = false } = {}) {
  if (typeof owner !== 'string' || !owner.trim() || ['__proto__', 'constructor', 'prototype'].includes(owner)) fail('Invalid owner');
  if (!Array.isArray(copies)) fail('copies must be an array');
  return locked(ledger => {
    const old = Object.hasOwn(ledger.owners, owner) ? ledger.owners[owner].files : [];
    const desired = new Set(), files = [], changes = [];
    // Validate everything, including stale removals, before journaled target mutation.
    for (const copy of copies) {
      if (typeof copy.path !== 'string') fail('Missing target path');
      const target = safe(path.resolve(copy.path));
      if (desired.has(target)) fail(`Duplicate target: ${target}`);
      desired.add(target);
      if (Object.entries(ledger.owners).some(([key, receipt]) => key !== owner && receipt.files.some(item => item.path === target))) fail(`Overlapping ownership: ${target}`);
      const previous = old.find(item => item.path === target);
      if (previous) removal(previous);
      const current = read(target);
      const source = copy.source !== undefined ? read(safe(path.resolve(copy.source))) : null;
      if (copy.source !== undefined && !source) fail(`Missing source: ${copy.source}`);
      if (copy.source === undefined && typeof copy.data !== 'string' && !Buffer.isBuffer(copy.data)) fail('Expected source or Buffer/string data');
      const data = source ? source.data : Buffer.from(copy.data);
      const sha256 = hash(data), mode = copy.mode ?? source?.mode ?? current?.mode ?? 0o644;
      if (!previous && current && current.sha256 !== sha256 && !overwrite) fail(`Target already exists (overwrite required): ${target}`);
      const item = { path: target, sha256, mode, existed: previous?.existed ?? !!current };
      if (previous?.existed) Object.assign(item, { backup: previous.backup, backupSha256: previous.backupSha256, backupMode: previous.backupMode });
      else if (!previous && current) Object.assign(item, { backup: blob(current.data), backupSha256: current.sha256, backupMode: current.mode });
      validateItem(item); files.push(item); changes.push({ path: target, data, mode });
    }
    for (const item of old) if (!desired.has(item.path)) changes.push(removal(item));
    const receipt = { owner, files, transactionId: randomUUID() };
    // Use the journal's transaction id in the returned and persisted receipt.
    const owners = { ...ledger.owners, [owner]: receipt };
    const transactionId = transact(ledger, changes, owners, receipt.transactionId);
    return { ...receipt, transactionId };
  });
}
function plan(ledger, { owners, includeAll = false } = {}) {
  if (owners !== undefined && (!Array.isArray(owners) || owners.some(owner => typeof owner !== 'string'))) fail('owners must be an array');
  const selected = (includeAll ? Object.keys(ledger.owners) : [...new Set(owners ?? [])]).sort();
  const operations = [], conflicts = [];
  for (const owner of selected) {
    const receipt = Object.hasOwn(ledger.owners, owner) ? ledger.owners[owner] : null;
    for (const item of receipt?.files ?? []) {
      try { const change = removal(item); operations.push({ owner, path: item.path, action: change.action, sha256: item.sha256, backupSha256: item.backupSha256, mode: item.mode, backupMode: item.backupMode }); }
      catch (error) { conflicts.push({ owner, path: item.path, message: error.message }); }
    }
  }
  const result = { owners: selected, includeAll, operations, conflicts };
  return { ...result, planId: digest({ ...result, ledger }) };
}
export function planRemoval(options = {}) { return locked(ledger => plan(ledger, options)); }
export function applyRemoval({ planId, owners, includeAll = false } = {}) {
  return locked(ledger => {
    const current = plan(ledger, { owners, includeAll });
    if (current.planId !== planId) fail('Removal plan changed; generate a new plan');
    if (current.conflicts.length) fail(`Removal conflicts: ${current.conflicts.map(item => item.message).join('; ')}`);
    const remaining = { ...ledger.owners }, changes = [];
    for (const owner of current.owners) {
      for (const item of (Object.hasOwn(remaining, owner) ? remaining[owner].files : [])) changes.push(removal(item));
      delete remaining[owner];
    }
    const transactionId = transact(ledger, changes, remaining);
    return { ...current, transactionId, removed: current.operations.length };
  });
}
export function uninstallOwner(owner) { const options = { owners: [owner] }; const preview = planRemoval(options); return applyRemoval({ ...options, planId: preview.planId }); }
export function inventory() {
  return locked(ledger => ({
    workspace: ledger.workspace,
    owners: Object.keys(ledger.owners).sort(),
    entries: Object.values(ledger.owners).flatMap(receipt => receipt.files.map(item => ({ ...item, owner: receipt.owner }))),
  }));
}


function localRoots(directoryRoots) {
  if (!Array.isArray(directoryRoots) || !directoryRoots.length) fail('directoryRoots must be a nonempty array');
  const state = path.resolve(STATE);
  const roots = [...new Set(directoryRoots.map(root => {
    if (typeof root !== 'string') fail('Invalid capture root');
    const resolved = safe(path.resolve(root));
    if (!resolved.startsWith(state + path.sep) || resolved === runtime || runtime.startsWith(resolved + path.sep) || resolved === backups || resolved.startsWith(backups + path.sep) || resolved === ledgerPath || resolved === lockPath || resolved.startsWith(lockPath + '.') || resolved.startsWith(ledgerPath + '.')) fail(`Unsafe capture root outside STATE or containing journal: ${resolved}`);
    return resolved;
  }))].sort();
  if (roots.some((root, index) => roots.some((other, otherIndex) => index !== otherIndex && root.startsWith(other + path.sep)))) fail('Overlapping capture roots');
  return roots;
}
function captureOptions({ excludePaths = [], excludeNames = [] } = {}) {
  const state = path.resolve(STATE);
  if (!Array.isArray(excludePaths) || !Array.isArray(excludeNames)) fail('Capture exclusions must be arrays');
  for (const prefix of excludePaths) {
    if (typeof prefix !== 'string' || !path.isAbsolute(prefix) || path.resolve(prefix) !== prefix || !prefix.startsWith(state + path.sep)) fail('Excluded paths must be absolute paths inside STATE');
  }
  for (const name of excludeNames) {
    if (typeof name !== 'string' || !name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) fail('Excluded names must be basenames');
  }
  return { excludePaths: [...new Set(excludePaths)].sort(), excludeNames: [...new Set(excludeNames)].sort() };
}
function excluded(file, options) {
  return options.excludePaths.some(prefix => file === prefix || file.startsWith(prefix + path.sep)) ||
    path.relative(path.resolve(STATE), file).split(path.sep).some(name => options.excludeNames.includes(name));
}
function captured(file, roots, options) {
  return roots.some(root => file.startsWith(root + path.sep)) && !excluded(file, options);
}
function scan(roots, options) {
  const files = new Map();
  function visit(file) {
    if (excluded(file, options)) return;
    safe(file);
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isDirectory()) { for (const entry of fs.readdirSync(file).sort()) visit(path.join(file, entry)); }
    else { const current = read(file); files.set(file, current); }
  }
  for (const root of roots) {
    if (excluded(root, options)) continue;
    safe(root);
    if (fs.existsSync(root) && !fs.statSync(root).isDirectory()) fail(`Capture root is not a directory: ${root}`);
    visit(root);
  }
  return files;
}
function validProcessGroup(pgid) {
  if (!Number.isSafeInteger(pgid) || pgid <= 1 || pgid > 0x7fffffff) fail('Invalid writer process group');
}
function writerAlive(pgid) {
  validProcessGroup(pgid);
  try { process.kill(-pgid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}
function finishCapture(ledger) {
  const pending = ledger.pending;
  if (pending.writerProcessGroup !== undefined && writerAlive(pending.writerProcessGroup)) fail(`Capture writer process group still alive: ${pending.writerProcessGroup}`);
  const roots = localRoots(pending.roots);
  const options = captureOptions(pending.options);
  const after = scan(roots, options);
  const old = ledger.owners[pending.owner]?.files ?? [];
  const before = new Map(pending.before.map(item => [item.path, item]));
  for (const item of before.values()) {
    if (!captured(item.path, roots, options)) fail('Invalid capture snapshot path');
    if (item.backup) backupData(item.backup, item.sha256);
    else if (!old.some(previous => previous.path === item.path)) fail('Missing capture backup');
  }
  const files = old.filter(item => !captured(item.path, roots, options));
  const paths = new Set([...before.keys(), ...after.keys(), ...old.filter(item => captured(item.path, roots, options)).map(item => item.path)]);
  for (const file of [...paths].sort()) {
    const original = before.get(file), current = after.get(file), previous = old.find(item => item.path === file);
    if (!previous && original?.sha256 === current?.sha256 && original?.mode === current?.mode) continue;
    if (!current && !original && !previous?.existed) continue;
    const item = { path: file, sha256: current?.sha256 ?? null, mode: current?.mode ?? original?.mode ?? previous?.mode ?? 0o644, existed: previous?.existed ?? !!original };
    if (previous?.existed) Object.assign(item, { backup: previous.backup, backupSha256: previous.backupSha256, backupMode: previous.backupMode });
    else if (!previous && original) Object.assign(item, { backup: original.backup, backupSha256: original.sha256, backupMode: original.mode });
    validateItem(item); files.push(item);
  }
  const receipt = { owner: pending.owner, files, transactionId: pending.transactionId };
  const owners = { ...ledger.owners, [pending.owner]: receipt };
  const retainedOriginalBackups = originalBackups(ledger, owners);
  save({ ...ledger, owners, retainedOriginalBackups, pending: null });
  ledger.owners = owners; ledger.retainedOriginalBackups = retainedOriginalBackups; ledger.pending = null;
  return receipt;
}

// Excluded paths match themselves and descendants; excluded basenames prune files
// and directories. Exclusions affect this capture only, preserving prior receipts.
// actionFn may be asynchronous. A failed action still commits its observed changes
// to ownership; interrupted captures finalize once registered writers have exited.
// actionFn(registerWriter) must register a detached, stdin-gated worker group before
// releasing its gate. Registration is synchronous and durable before returning.
export function captureLocalFiles(owner, directoryRoots, actionFn, options = {}) {
  if (typeof owner !== 'string' || !owner.trim() || ['__proto__', 'constructor', 'prototype'].includes(owner)) fail('Invalid owner');
  if (typeof actionFn !== 'function') fail('actionFn must be a function');
  return locked(async ledger => {
    const roots = localRoots(directoryRoots);
    const exclusions = captureOptions(options);
    for (const [other, receipt] of Object.entries(ledger.owners)) {
      for (const item of receipt.files) {
        if (!captured(item.path, roots, exclusions)) continue;
        if (other !== owner) fail(`Overlapping ownership: ${item.path}`);
        removal(item);
      }
    }
    const before = [];
    for (const [file, current] of scan(roots, exclusions)) {
      const owned = ledger.owners[owner]?.files.some(item => item.path === file);
      before.push({ path: file, sha256: current.sha256, mode: current.mode, ...(owned ? {} : { backup: blob(current.data) }) });
    }
    ledger.pending = { capture: true, owner, roots, options: exclusions, before, transactionId: randomUUID() };
    save(ledger);
    let result, actionError, acceptingWriters = true;
    const registerWriter = pgid => {
      if (!acceptingWriters) fail('Capture action already finished');
      validProcessGroup(pgid);
      const pending = ledger.pending;
      if (pending.writerProcessGroup !== undefined && pending.writerProcessGroup !== pgid && writerAlive(pending.writerProcessGroup)) fail('Capture already has a live writer process group');
      if (!writerAlive(pgid)) fail(`Writer process group is not alive: ${pgid}`);
      // Keep the in-memory barrier too if saving fails: the caller must leave
      // its worker gated, and recovery must not silently finalize this capture.
      pending.writerProcessGroup = pgid;
      save(ledger);
    };
    try { result = await actionFn(registerWriter); } catch (error) { actionError = error; }
    finally { acceptingWriters = false; }
    let receipt;
    try { receipt = finishCapture(ledger); }
    catch (error) {
      if (actionError) throw new AggregateError([actionError, error], 'Setup failed; capture recovery required');
      throw error;
    }
    if (actionError) throw actionError;
    return { ...receipt, result };
  });
}


// Original contents are historical recovery assets, even after their owner is
// removed. Rollback blobs and intermediate tool versions have no such lifetime.
function originalBackups(ledger, nextOwners = ledger.owners) {
  const retained = ledger.retainedOriginalBackups ?? [];
  if (!Array.isArray(retained)) fail('Invalid retained original backups');
  const byHash = new Map();
  const keep = (backup, sha256) => {
    backupData(backup, sha256);
    byHash.set(sha256, { backup, sha256 });
  };
  for (const item of retained) keep(item.backup, item.sha256);
  for (const owners of [ledger.owners, nextOwners]) {
    for (const receipt of Object.values(owners)) {
      for (const item of receipt.files) if (item.existed) keep(item.backup, item.backupSha256);
    }
  }
  return [...byHash.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
}

export function pruneTransactionBackups() {
  return locked(ledger => {
    const retainedOriginalBackups = originalBackups(ledger);
    const keep = new Set(retainedOriginalBackups.map(item => item.sha256));
    if (ledger.pending) {
      if (!Array.isArray(ledger.pending.before)) fail('Invalid pending backup snapshots');
      const snapshots = [...ledger.pending.before];
      if (ledger.pending.after !== undefined) {
        if (!Array.isArray(ledger.pending.after)) fail('Invalid pending after snapshots');
        snapshots.push(...ledger.pending.after);
      }
      for (const item of snapshots) {
        if (item.sha256 !== null) {
          if (!/^[a-f0-9]{64}$/.test(item.sha256)) fail('Invalid pending snapshot hash');
          keep.add(item.sha256);
        }
        if (item.backup) { backupData(item.backup, item.sha256); keep.add(item.sha256); }
        else if (item.sha256 !== null && !ledger.pending.capture && ledger.pending.before.includes(item)) fail('Missing pending backup snapshot');
      }
    }
    const unused = [];
    // Preflight the whole directory and all references before deleting any blob.
    for (const name of fs.readdirSync(backups).sort()) {
      const file = safe(path.join(backups, name));
      if (!fs.lstatSync(file).isFile()) fail(`Unexpected backup entry: ${file}`);
      if (!/^[a-f0-9]{64}$/.test(name) || keep.has(name)) continue;
      const current = read(file);
      if (!current || current.sha256 !== name) fail(`Corrupt backup: ${file}`);
      unused.push({ file, bytes: current.data.length });
    }
    // Persist legacy active originals before pruning; never finalize an in-flight
    // capture here, particularly when a detached writer is still running.
    save({ ...ledger, retainedOriginalBackups });
    for (const item of unused) remove(item.file);
    return { removed: unused.length, bytesRemoved: unused.reduce((sum, item) => sum + item.bytes, 0), retained: keep.size };
  }, { recoverPending: false });
}

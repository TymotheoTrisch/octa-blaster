import test from 'node:test';
import assert from 'node:assert/strict';
import { rawStorageSet } from '../utils/storage.ts';
import { installStorage } from './helpers.mjs';

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  return () => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
}

test('saving rejects when both primary storage and its local backup fail', async t => {
  t.mock.method(console, 'warn', () => {});
  const storage = installStorage();
  browser.storage.local.set = async () => { throw new Error('primary quota'); };
  const restore = replaceGlobal('localStorage', { setItem() { throw new Error('backup quota'); } });
  try {
    await assert.rejects(rawStorageSet({ value: 'new' }), /Não foi possível salvar/);
    assert.equal(storage.data.value, undefined);
  } finally { restore(); storage.restore(); }
});

test('primary success is sufficient when local backup fails', async () => {
  const storage = installStorage();
  const restore = replaceGlobal('localStorage', { setItem() { throw new Error('backup quota'); } });
  try {
    await rawStorageSet({ value: 'new' });
    assert.equal(storage.data.value, 'new');
  } finally { restore(); storage.restore(); }
});

test('fallback succeeds only if all requested keys were saved', async t => {
  t.mock.method(console, 'warn', () => {});
  const storage = installStorage();
  browser.storage.local.set = async () => { throw new Error('primary unavailable'); };
  const saved = {};
  const restore = replaceGlobal('localStorage', { setItem(key, value) { saved[key] = value; } });
  try {
    await rawStorageSet({ a: 1, b: 2 });
    assert.deepEqual(saved, { a: '1', b: '2' });
    localStorage.setItem = (key, value) => { if (key === 'b') throw new Error('full'); saved[key] = value; };
    await assert.rejects(rawStorageSet({ a: 3, b: 4 }), /Não foi possível salvar/);
  } finally { restore(); storage.restore(); }
});

test('saving rejects when no storage is available', async () => {
  const restoreBrowser = replaceGlobal('browser', undefined);
  const restoreChrome = replaceGlobal('chrome', undefined);
  const restoreLocal = replaceGlobal('localStorage', undefined);
  try { await assert.rejects(rawStorageSet({ a: 1 }), /Não foi possível salvar/); }
  finally { restoreLocal(); restoreChrome(); restoreBrowser(); }
});

test('legacy Chrome callback errors reject and writes are invoked once', async t => {
  t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const chrome = { runtime: {}, storage: { local: { set(_items, callback) {
    calls++;
    queueMicrotask(() => {
      chrome.runtime.lastError = { message: 'quota exceeded' };
      callback();
      delete chrome.runtime.lastError;
    });
  } } } };
  const restoreBrowser = replaceGlobal('browser', undefined);
  const restoreChrome = replaceGlobal('chrome', chrome);
  const restoreLocal = replaceGlobal('localStorage', undefined);
  try {
    await assert.rejects(rawStorageSet({ a: 1 }), /Não foi possível salvar/);
    assert.equal(calls, 1);
    chrome.storage.local.set = (_items, callback) => { calls++; queueMicrotask(callback); };
    await rawStorageSet({ a: 2 });
    assert.equal(calls, 2);
  } finally { restoreLocal(); restoreChrome(); restoreBrowser(); }
});

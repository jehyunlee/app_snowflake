import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => id));

test('the page is a self-contained document with no leftover artifact-frame runtime', () => {
  assert.match(html, /^<!doctype html>/i);
  assert.equal(/__FRAME_PREAMBLE|frame-runtime|claudeusercontent/.test(html), false);
  assert.ok(script.length > 10000, 'the simulation script must ship inline');
});

test('every local reference stays relative so the /snowflake/ subpath keeps working', () => {
  for (const [, href] of html.matchAll(/(?:src|href)=["'](?!https?:|data:|#)([^"']+)["']/g)) {
    const local = path.resolve(root, href.split(/[?#]/)[0]);
    assert.ok(local.startsWith(root + path.sep), href);
    assert.ok(fs.existsSync(local), href);
  }
  assert.equal(/(?:src|href)=["']\//.test(html), false, 'no root-absolute paths');
});

test('the social card metadata matches the deployed location and the shipped image', () => {
  assert.match(html, /<meta property="og:url" content="https:\/\/app\.jehyunlee\.dev\/snowflake\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/app\.jehyunlee\.dev\/snowflake\/og-image\.jpg">/);
  assert.ok(fs.statSync(path.join(root, 'og-image.jpg')).size > 10000);
});

test('the 3D renderer resolves three.js and its addons from vendored files', () => {
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const vendored = (spec) => {
    const local = path.resolve(root, spec);
    assert.ok(local.startsWith(root + path.sep), spec);
    assert.ok(fs.existsSync(local), spec);
    return fs.readFileSync(local, 'utf8');
  };
  const three = vendored(map.imports.three);
  for (const [, spec] of three.matchAll(/from '(\.[^']+)'/g)) vendored(path.join('js/vendor', spec));
  for (const [, spec] of script.matchAll(/from '(three\/addons\/[^']+)'/g)) {
    const addon = vendored(spec.replace('three/addons/', map.imports['three/addons/']));
    const deps = [...addon.matchAll(/^} from '([^']+)'/gm)].map(([, dep]) => dep);
    assert.deepEqual(deps, ['three'], spec + ' must only import three');
  }
});

test('every element the script looks up exists in the markup', () => {
  const looked = new Set([...script.matchAll(/\$\('([^']+)'\)/g)].map(([, id]) => id));
  assert.ok(looked.size > 10, 'the script must address the control panel by id');
  for (const id of looked) assert.ok(ids.has(id), id);
});

test('every climate preset carries the four values the simulator reads', () => {
  const presets = [...html.matchAll(/data-p="([^"]+)"/g)].map(([, value]) => value).filter((value) => value !== 'scen');
  assert.ok(presets.length >= 4, 'the page must offer preset conditions');
  for (const preset of presets) {
    const numbers = preset.split(',').map(Number);
    assert.equal(numbers.length, 4, preset);
    assert.ok(numbers.every(Number.isFinite), preset);
  }
});

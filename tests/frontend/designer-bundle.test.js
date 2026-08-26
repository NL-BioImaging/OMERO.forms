const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bundlePath = path.resolve(
  __dirname,
  '../../omero_forms/static/forms/js/designer.js'
);
const bundle = fs.readFileSync(bundlePath, 'utf8');

assert.doesNotMatch(
  bundle,
  /ES Modules may not assign module\.exports/,
  "designer bundle contains Webpack's CommonJS-in-ESM runtime failure"
);

console.log('designer bundle module-format test passed');

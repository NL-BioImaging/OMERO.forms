const assert = require('node:assert/strict');

const run = async () => {
  const {
    copiedFromCandidate,
    findReuseHistoryEntry,
    hasFormVersionChanged,
  } = await import('../../src/reuse-selection.mjs');

  const candidate = {
    sourceFormId: 'Investigation',
    sourceFormTimestamp: 'schema-v1',
    sourceObjectType: 'Project',
    sourceObjectId: 12,
    sourceDataTimestamp: '2026-08-26T12:00:00.123456',
    sourceObjectName: 'Source project',
    message: 'not provenance',
  };

  assert.deepEqual(copiedFromCandidate(candidate), {
    sourceFormId: 'Investigation',
    sourceFormTimestamp: 'schema-v1',
    sourceObjectType: 'Project',
    sourceObjectId: 12,
    sourceDataTimestamp: '2026-08-26T12:00:00.123456',
  });

  const entries = [
    {dataTimestamp: 'newer'},
    {dataTimestamp: candidate.sourceDataTimestamp, formData: '{"name":"Ada"}'},
  ];
  assert.equal(findReuseHistoryEntry(entries, candidate), entries[1]);
  assert.equal(findReuseHistoryEntry([], candidate), undefined);
  assert.equal(hasFormVersionChanged(candidate, 'schema-v2'), true);
  assert.equal(hasFormVersionChanged(candidate, 'schema-v1'), false);

  console.log('reuse selection tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

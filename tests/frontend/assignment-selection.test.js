const assert = require('node:assert/strict');

const run = async () => {
  const {
    canSaveAssignments,
    formIdsForGroup,
    groupIdsFromSelection,
    groupIdsForForm,
    sameAssignmentMembers,
  } = await import('../../src/assignment-selection.mjs');

  assert.deepEqual(groupIdsFromSelection(null), []);
  assert.deepEqual(groupIdsFromSelection([]), []);
  assert.deepEqual(
    groupIdsFromSelection([{value: 3}, {value: 7}]),
    [3, 7]
  );

  assert.equal(canSaveAssignments(undefined, []), false);
  assert.equal(canSaveAssignments('Example form', []), true);
  assert.equal(canSaveAssignments('Example form', [3]), true);

  const assignments = {
    3: ['Investigation', 'Study'],
    7: ['Study'],
  };
  assert.deepEqual(formIdsForGroup(assignments, 3), ['Investigation', 'Study']);
  assert.deepEqual(groupIdsForForm(assignments, 'Study'), [3, 7]);
  assert.equal(
    sameAssignmentMembers(['Investigation', 'Study'], ['Study', 'Investigation']),
    true
  );
  assert.equal(
    sameAssignmentMembers(['Investigation'], ['Investigation', 'Study']),
    false
  );

  console.log('assignment selection tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

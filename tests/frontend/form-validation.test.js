const assert = require('node:assert/strict');

const run = async () => {
  const {
    canSaveForm,
    hasApplicableObjectType,
  } = await import('../../src/form-validation.mjs');

  assert.equal(hasApplicableObjectType([]), false);
  assert.equal(hasApplicableObjectType(['Project']), true);
  assert.equal(
    canSaveForm({
      formId: 'Example',
      unsaved: true,
      editable: true,
      formTypes: [],
    }),
    false
  );
  assert.equal(
    canSaveForm({
      formId: 'Example',
      unsaved: true,
      editable: true,
      formTypes: ['Project'],
    }),
    true
  );

  console.log('form validation tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

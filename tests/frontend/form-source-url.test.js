const assert = require('node:assert/strict');

const run = async () => {
  const {
    extractSourceUrlFromMessage,
    sourceUrlFromFormVersion,
  } = await import('../../src/form-source-url.mjs');

  const legacyUrl = 'https://example.org/forms/schema.json';
  assert.equal(
    extractSourceUrlFromMessage(`Loaded version v1.0.0 from ${legacyUrl}`),
    legacyUrl
  );
  assert.equal(
    sourceUrlFromFormVersion({
      message: `Loaded version v1.0.0 from ${legacyUrl}`,
    }),
    legacyUrl
  );
  assert.equal(
    sourceUrlFromFormVersion({
      sourceUrl: 'https://example.org/forms/new/schema.json',
      message: `Loaded version v1.0.0 from ${legacyUrl}`,
    }),
    'https://example.org/forms/new/schema.json'
  );
  assert.equal(
    sourceUrlFromFormVersion({
      sourceUrl: '',
      message: `Loaded version v1.0.0 from ${legacyUrl}`,
    }),
    ''
  );

  console.log('form source URL tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

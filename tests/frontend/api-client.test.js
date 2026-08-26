const assert = require('node:assert/strict');

const run = async () => {
  const {
    buildApiUrl,
    encodePathSegment,
    fetchJson,
  } = await import('../../src/api-client.mjs');

  assert.equal(
    buildApiUrl(
      '/omero_forms/',
      'get_form',
      'LEI-MIBME User Template v1'
    ),
    '/omero_forms/get_form/LEI-MIBME%20User%20Template%20v1/'
  );
  assert.equal(encodePathSegment('name?#'), 'name%3F%23');

  const value = await fetchJson('/working/', async () => ({
    ok: true,
    status: 200,
    json: async () => ({form: 'loaded'}),
  }));
  assert.deepEqual(value, {form: 'loaded'});

  let parsedErrorBody = false;
  await assert.rejects(
    fetchJson('/missing/', async () => ({
      ok: false,
      status: 404,
      json: async () => {
        parsedErrorBody = true;
        throw new SyntaxError('Unexpected XML');
      },
    })),
    /Request to \/missing\/ returned HTTP 404/
  );
  assert.equal(parsedErrorBody, false);

  console.log('API client tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

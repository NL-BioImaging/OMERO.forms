const assert = require('node:assert/strict');

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const run = async () => {
  const {
    adjacentUiSchemaUrl,
    containsUiSchemaDirective,
    convertGitHubUrl,
    loadFormPackageFromUrl,
  } = await import('../../src/form-url-loader.mjs');

  const githubUrl =
    'https://github.com/example/forms/blob/main/assay/schema.json';
  const rawSchemaUrl =
    'https://raw.githubusercontent.com/example/forms/main/assay/schema.json';
  const rawUiSchemaUrl =
    'https://raw.githubusercontent.com/example/forms/main/assay/uischema.json';

  assert.equal(convertGitHubUrl(githubUrl), rawSchemaUrl);
  assert.equal(adjacentUiSchemaUrl(githubUrl), rawUiSchemaUrl);
  assert.equal(containsUiSchemaDirective({'ui:order': ['name']}), true);
  assert.equal(
    containsUiSchemaDirective({section: {name: {'ui:widget': 'textarea'}}}),
    true
  );
  assert.equal(
    containsUiSchemaDirective({type: 'Categorization', elements: {}}),
    false
  );

  {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url === rawSchemaUrl) {
        return response(200, {title: 'Assay', type: 'object'});
      }
      if (url === rawUiSchemaUrl) {
        return response(200, {'ui:order': ['name']});
      }
      throw new Error(`unexpected URL: ${url}`);
    };

    const loaded = await loadFormPackageFromUrl(githubUrl, fetchImpl);
    assert.deepEqual(calls, [rawSchemaUrl, rawUiSchemaUrl]);
    assert.deepEqual(loaded.schema, {title: 'Assay', type: 'object'});
    assert.deepEqual(loaded.uiSchema, {'ui:order': ['name']});
    assert.equal(loaded.uiSchemaWarning, null);
  }

  {
    const fetchImpl = async (url) =>
      url === rawSchemaUrl
        ? response(200, {title: 'Schema only', type: 'object'})
        : response(404, null);

    const loaded = await loadFormPackageFromUrl(githubUrl, fetchImpl);
    assert.deepEqual(loaded.uiSchema, {});
    assert.equal(loaded.uiSchemaWarning, null);
  }

  {
    const fetchImpl = async (url) =>
      url === rawSchemaUrl
        ? response(200, {title: 'Bad UI schema', type: 'object'})
        : response(200, []);

    const loaded = await loadFormPackageFromUrl(githubUrl, fetchImpl);
    assert.deepEqual(loaded.uiSchema, {});
    assert.match(loaded.uiSchemaWarning, /must contain a JSON object/);
  }

  {
    const fetchImpl = async (url) =>
      url === rawSchemaUrl
        ? response(200, {title: 'JSON Forms UI schema', type: 'object'})
        : response(200, {type: 'Categorization', elements: {}});

    const loaded = await loadFormPackageFromUrl(githubUrl, fetchImpl);
    assert.deepEqual(loaded.uiSchema, {});
    assert.match(loaded.uiSchemaWarning, /does not contain any RJSF ui:\* directives/);
  }

  await assert.rejects(
    loadFormPackageFromUrl(githubUrl, async () => response(500, null)),
    /schema request returned HTTP 500/
  );

  console.log('form URL loader tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

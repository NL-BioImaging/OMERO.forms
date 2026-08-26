const assert = require('node:assert/strict');

const run = async () => {
  const {
    editorDocumentKey,
    nextEditorRevision,
  } = await import('../../src/editor-document-key.mjs');

  {
    const currentRevision = 4;
    const nextRevision = nextEditorRevision(currentRevision);

    assert.notEqual(
      editorDocumentKey(currentRevision, 'schema'),
      editorDocumentKey(nextRevision, 'schema')
    );
  }

  {
    const revision = 7;
    const keys = [
      editorDocumentKey(revision, 'schema'),
      editorDocumentKey(revision, 'uiSchema'),
      editorDocumentKey(revision, 'formData'),
    ];

    assert.equal(new Set(keys).size, keys.length);
  }

  console.log('editor document key tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

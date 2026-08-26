const assert = require('node:assert/strict');

const {
  editorDocumentKey,
  nextEditorRevision,
} = require('../../src/editor-document-key');

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

const editorDocumentKey = (revision, documentName) =>
  `${documentName}:${revision}`;

const nextEditorRevision = (revision) => revision + 1;

module.exports = {
  editorDocumentKey,
  nextEditorRevision,
};

export const editorDocumentKey = (revision, documentName) =>
  `${documentName}:${revision}`;

export const nextEditorRevision = (revision) => revision + 1;

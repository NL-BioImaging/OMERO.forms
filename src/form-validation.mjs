export const hasApplicableObjectType = (formTypes) =>
  Array.isArray(formTypes) && formTypes.length > 0;

export const canSaveForm = ({formId, unsaved, editable, formTypes}) =>
  Boolean(formId) &&
  Boolean(unsaved) &&
  Boolean(editable) &&
  hasApplicableObjectType(formTypes);

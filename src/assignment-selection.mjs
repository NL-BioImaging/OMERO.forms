export const groupIdsFromSelection = (selection) =>
  (selection || []).map(option => option.value);

export const canSaveAssignments = (formId, groupIds) =>
  Boolean(formId) && Array.isArray(groupIds);

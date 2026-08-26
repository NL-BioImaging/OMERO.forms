export const groupIdsFromSelection = (selection) =>
  (selection || []).map(option => option.value);

export const canSaveAssignments = (formId, groupIds) =>
  Boolean(formId) && Array.isArray(groupIds);

export const formIdsForGroup = (assignments, groupId) =>
  assignments[groupId] || [];

export const groupIdsForForm = (assignments, formId) =>
  Object.keys(assignments)
    .filter(groupId => (assignments[groupId] || []).includes(formId))
    .map(groupId => parseInt(groupId, 10));

export const sameAssignmentMembers = (left, right) => {
  const leftSet = new Set(left || []);
  const rightSet = new Set(right || []);
  return (
    leftSet.size === rightSet.size &&
    Array.from(leftSet).every(value => rightSet.has(value))
  );
};

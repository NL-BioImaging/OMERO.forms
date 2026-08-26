export const copiedFromCandidate = candidate => ({
  sourceFormId: candidate.sourceFormId,
  sourceFormTimestamp: candidate.sourceFormTimestamp,
  sourceObjectType: candidate.sourceObjectType,
  sourceObjectId: candidate.sourceObjectId,
  sourceDataTimestamp: candidate.sourceDataTimestamp,
});

export const findReuseHistoryEntry = (entries, candidate) =>
  (entries || []).find(entry =>
    entry.dataTimestamp === candidate.sourceDataTimestamp
  );

export const hasFormVersionChanged = (candidate, currentFormTimestamp) =>
  Boolean(
    candidate &&
    currentFormTimestamp &&
    candidate.sourceFormTimestamp !== currentFormTimestamp
  );

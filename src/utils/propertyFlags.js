export function isTruthyToggleValue(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value).trim().toLowerCase();
  return ['yes', 'true', '1', 'mergable', 'mergeable'].includes(normalized);
}

export function isMergeableItem(item, parentProject = null) {
  return isTruthyToggleValue(item?.mergable) || isTruthyToggleValue(parentProject?.mergable);
}

export function isBrokerItem(item, parentProject = null) {
  return String(item?.contactDesignation || '').trim().toLowerCase() === 'broker' ||
    String(parentProject?.contactDesignation || '').trim().toLowerCase() === 'broker';
}

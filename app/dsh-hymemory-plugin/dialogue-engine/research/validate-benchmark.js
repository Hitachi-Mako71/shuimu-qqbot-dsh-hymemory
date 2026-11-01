const ACTS = new Set(['respond','share_reaction','play_along','disagree','repair','answer','clarify','close']);
const DECISIONS = new Set(['skip','wait','reply']);
const DIMENSIONS = new Set(['frame','addressee','meaning_facts','emotion','persona','natural_expression','style_coordination','turn_progress','whole_context_fit','sociability','questions','common_ground','repair']);

export function validateBenchmark(benchmark) {
  const errors = [];
  if (benchmark?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (benchmark?.status !== 'development_set_only' || benchmark?.design?.split !== 'development') errors.push('benchmark must not be labeled as an untouched holdout');
  if (!Array.isArray(benchmark?.clusters) || benchmark.clusters.length < 30) errors.push('at least 30 scenario clusters are required');
  if (benchmark?.design?.clusters !== benchmark?.clusters?.length) errors.push('declared cluster count does not match data');
  const seenClusters = new Set();
  for (const cluster of benchmark?.clusters || []) {
    const at = `cluster ${cluster?.id || '(missing id)'}`;
    if (!cluster?.id || seenClusters.has(cluster.id)) errors.push(`${at}: id missing or duplicated`);
    seenClusters.add(cluster.id);
    if (!Array.isArray(cluster?.dimensions) || cluster.dimensions.length === 0 || cluster.dimensions.some(d => !DIMENSIONS.has(d))) errors.push(`${at}: invalid dimensions`);
    if (!Array.isArray(cluster?.context) || cluster.context.length < 10 || cluster.context.length > 20 || cluster.context.some(t => typeof t !== 'string' || !t.includes('：'))) errors.push(`${at}: context must contain 10–20 speaker-labeled turns`);
    if (!Array.isArray(cluster?.items) || cluster.items.length !== 2) { errors.push(`${at}: exactly two contrast items are required`); continue; }
    const seenItems = new Set();
    for (const item of cluster.items) {
      const itemAt = `${at}, item ${item?.id || '(missing id)'}`;
      if (!item?.id || seenItems.has(item.id)) errors.push(`${itemAt}: id missing or duplicated`);
      seenItems.add(item.id);
      if (typeof item?.text !== 'string' || !item.text.trim()) errors.push(`${itemAt}: current text missing`);
      if (typeof item?.criteria !== 'string' || !item.criteria.trim()) errors.push(`${itemAt}: acceptance criteria missing`);
      if ((item?.act && !ACTS.has(item.act)) || (item?.decision && !DECISIONS.has(item.decision)) || Boolean(item?.act) === Boolean(item?.decision)) errors.push(`${itemAt}: specify exactly one valid act or host decision`);
      if (item?.hasImages === true && !item?.assetRef) errors.push(`${itemAt}: image input must point to an authorized fixture`);
    }
    if (cluster.items[0]?.text === cluster.items[1]?.text) errors.push(`${at}: contrast items must differ`);
  }
  return errors;
}

// חישובים טהורים של גרף הקישורים, בנפרד מה־Canvas כדי שיהיה אפשר לבדוק אותם.

// חלוקה דטרמיניסטית לקהילות לפי צפיפות קישורים (שלב ההזזה המקומי של Louvain).
// המטרה כאן אינה מדד אקדמי מושלם אלא אשכולות יציבים ושימושיים לגרירה ולחקירה.
export function detectCommunities(ids, links) {
  const ordered = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
  const neighbors = new Map(ordered.map((id) => [id, new Map()]));
  for (const [a, b] of links) {
    if (a === b || !neighbors.has(a) || !neighbors.has(b)) continue;
    neighbors.get(a).set(b, (neighbors.get(a).get(b) || 0) + 1);
    neighbors.get(b).set(a, (neighbors.get(b).get(a) || 0) + 1);
  }
  const degree = new Map(ordered.map((id) => [id, [...neighbors.get(id).values()].reduce((sum, n) => sum + n, 0)]));
  const totalDegree = [...degree.values()].reduce((sum, n) => sum + n, 0) || 1;
  const community = new Map(ordered.map((id) => [id, id]));
  const totals = new Map(ordered.map((id) => [id, degree.get(id)]));

  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const id of ordered) {
      const own = community.get(id), k = degree.get(id);
      if (!k) continue;
      totals.set(own, (totals.get(own) || 0) - k);
      const weights = new Map();
      for (const [other, weight] of neighbors.get(id)) {
        const c = community.get(other);
        weights.set(c, (weights.get(c) || 0) + weight);
      }
      let best = own, bestGain = 0;
      for (const [candidate, inside] of [...weights].sort(([a], [b]) => String(a).localeCompare(String(b)))) {
        const gain = inside - ((totals.get(candidate) || 0) * k) / totalDegree;
        if (gain > bestGain + 1e-9) { best = candidate; bestGain = gain; }
      }
      community.set(id, best);
      totals.set(best, (totals.get(best) || 0) + k);
      if (best !== own) changed = true;
    }
    if (!changed) break;
  }

  // מזהה האשכול נגזר מהמסמך הראשון בו, כדי שלא יהיה תלוי במזהה פנימי מקרי.
  const members = new Map();
  for (const id of ordered) {
    const c = community.get(id);
    if (!members.has(c)) members.set(c, []);
    members.get(c).push(id);
  }
  const canonical = new Map([...members].map(([c, list]) => [c, list[0]]));
  return new Map(ordered.map((id) => [id, canonical.get(community.get(id))]));
}

export function seededOffset(key, radius = 36) {
  let hash = 2166136261;
  for (const ch of String(key)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const angle = ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

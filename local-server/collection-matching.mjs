const kinds = ['university', 'school', 'major', 'lab', 'professor'];
const lists = {
  university: 'universities',
  school: 'schools',
  major: 'majors',
  lab: 'labs',
  professor: 'professors',
};
const parents = {
  school: ['university', 'universityId'],
  major: ['school', 'schoolId'],
  lab: ['major', 'majorId'],
  professor: ['lab', 'labId'],
};
const normalize = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('專', '専')
    .replaceAll('专', '専')
    .replaceAll('學', '学')
    .replaceAll(/[\s\p{P}\p{S}]/gu, '');
function website(value) {
  try {
    const u = new URL(value);
    return (
      u.hostname.toLowerCase() +
      u.pathname.replace(/\/index\.html?$/i, '').replace(/\/+$/, '') +
      u.search
    );
  } catch {
    return '';
  }
}
function ancestorNames(data, kind, entity) {
  const result = [];
  while (parents[kind]) {
    const [parent, field] = parents[kind];
    entity = (data[lists[parent]] || []).find((e) => e.id === entity[field]);
    if (!entity) break;
    result.push(normalize(entity.name), normalize(entity.japaneseName));
    kind = parent;
  }
  return result.filter(Boolean);
}
function aliases(value, prefixes, kind) {
  let name = normalize(value);
  const result = new Set(name ? [name] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes)
      if (name.startsWith(prefix) && name !== prefix) {
        name = name.slice(prefix.length);
        result.add(name);
        changed = true;
      }
    if (kind !== 'university' && name.startsWith('大学院') && name.length > 3) {
      name = name.slice(3);
      result.add(name);
      changed = true;
    }
  }
  return result;
}
export function matchCollectionEntities(data, job) {
  const raw = {};
  for (const kind of kinds) {
    const fields = job.draft?.[kind] || [];
    const names = fields
      .filter((f) => ['japaneseName', 'name'].includes(f.field))
      .map((f) => f.value);
    const urls = new Set(
      fields
        .filter((f) =>
          ['laboratoryWebsite', 'personalWebsite', 'website'].includes(f.field),
        )
        .map((f) => website(f.value))
        .filter(Boolean),
    );
    const anchor = job.parent && job.target?.ids?.[kind];
    raw[kind] = (data[lists[kind]] || [])
      .filter((entity) => {
        if (anchor) return entity.id === anchor;
        if (
          [
            entity.website,
            entity.personalWebsite,
            entity.laboratoryWebsite,
          ].some((u) => u && urls.has(website(u)))
        )
          return true;
        const prefixes = ancestorNames(data, kind, entity);
        const known = new Set(
          [entity.name, entity.japaneseName].flatMap((n) => [
            ...aliases(n, prefixes, kind),
          ]),
        );
        return names.some((n) =>
          [...aliases(n, prefixes, kind)].some((a) => known.has(a)),
        );
      })
      .map((e) => e.id);
  }
  const evidence = Object.fromEntries(
    kinds.map((kind) => [kind, raw[kind].length > 0]),
  );
  let result = {};
  for (let round = 0; round < kinds.length; round++) {
    result = {};
    for (const kind of kinds) {
      result[kind] = raw[kind].filter((id) => {
        let entity = (data[lists[kind]] || []).find((e) => e.id === id);
        let level = kind;
        while (parents[level]) {
          const [parent, field] = parents[level];
          if (
            result[parent].length > 0 &&
            !result[parent].includes(entity[field])
          )
            return false;
          if (evidence[parent] && result[parent].length === 0) return false;
          entity = (data[lists[parent]] || []).find(
            (e) => e.id === entity[field],
          );
          if (!entity) return false;
          level = parent;
        }
        return true;
      });
    }
    let changed = false;
    for (const kind of kinds.toReversed())
      if (result[kind].length === 1 && parents[kind] && !job.parent) {
        const [parent, field] = parents[kind];
        const entity = data[lists[kind]].find((e) => e.id === result[kind][0]);
        if (!evidence[parent] && raw[parent].length === 0 && entity?.[field]) {
          raw[parent] = [entity[field]];
          changed = true;
        }
      }
    if (!changed) break;
  }
  return result;
}

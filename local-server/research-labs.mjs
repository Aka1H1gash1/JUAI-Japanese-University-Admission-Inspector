import { randomUUID } from 'node:crypto';

// Teacher IDs remain stable so documents and messages retain their owners.
export function upgradeResearchLabs(data, previous) {
  const legacy = data.labs === undefined;
  if (legacy) data.labs = structuredClone(previous?.labs ?? []);
  const previousProfessors = new Map(
    (previous?.professors ?? []).map((item) => [item.id, item]),
  );
  const usedIds = new Set(
    ['universities', 'schools', 'majors', 'professors', 'labs'].flatMap((key) =>
      (Array.isArray(data[key]) ? data[key] : []).map((item) => item?.id),
    ),
  );
  const generated = new Set();
  for (const professor of data.professors ?? []) {
    if (!professor || typeof professor !== 'object') continue;
    if (professor.labId === undefined && legacy) {
      const retained = previousProfessors.get(professor.id)?.labId;
      if (
        data.labs.some(
          (item) => item?.id === retained && item.majorId === professor.majorId,
        )
      )
        professor.labId = retained;
    }
    if (professor.labId !== undefined) continue;
    const name =
      (typeof professor.laboratory === 'string'
        ? professor.laboratory.trim()
        : '') || `${professor.name}研究室`;
    let lab = data.labs.find(
      (item) => item?.majorId === professor.majorId && item.name === name,
    );
    if (!lab) {
      let id;
      do {
        id = randomUUID();
      } while (usedIds.has(id));
      usedIds.add(id);
      lab = {
        id,
        majorId: professor.majorId,
        name,
        japaneseName: '',
        research: professor.research ?? '',
        website: professor.laboratoryWebsite ?? '',
        notes: '',
        examNotes: '',
        applicationNotes: '',
        wantApply: false,
      };
      data.labs.push(lab);
      generated.add(lab.id);
    } else if (generated.has(lab.id)) {
      const research =
        typeof professor.research === 'string' ? professor.research.trim() : '';
      if (
        research &&
        !lab.research.split('\n').includes(research) &&
        lab.research.length + research.length + 1 <= 4000
      )
        lab.research = [lab.research, research].filter(Boolean).join('\n');
      if (!lab.website && professor.laboratoryWebsite)
        lab.website = professor.laboratoryWebsite;
    }
    professor.labId = lab.id;
  }
  return data;
}

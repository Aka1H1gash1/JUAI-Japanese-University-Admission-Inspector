export function admissionPriorityPages(pages) {
  const usable = pages.filter(
    (p) =>
      !/目\s*次|table of contents|\bcontents\b/i.test(p.text.slice(0, 600)),
  );
  const result = new Set([1]);
  const add = (p) => {
    if (p) result.add(p.page);
  };
  const materials = usable.find((p) =>
    /Documents to be submitted|提出書類|出願書類/i.test(p.text),
  );
  add(materials);
  if (materials) {
    const next = pages.find((p) => p.page === materials.page + 1);
    if (
      next &&
      /score sheet|documents|certificate|envelope|証明|書類|封筒/i.test(
        next.text,
      )
    )
      add(next);
  }
  // Follow the appendix, rather than stopping at "see Attached Sheet 1".
  const subjectPages = usable.filter((p) =>
    /Specialized Subjects|専門科目|試験科目|Examination Subjects/i.test(p.text),
  );
  subjectPages.sort((a, b) => {
    const score = (p) =>
      Number(/Attached Sheet|別紙|付表|附表/i.test(p.text)) * 2 +
      Number(/Answer \d|Select \d|Date\/time|必答|選択|選べ/i.test(p.text)) * 4;
    return score(b) - score(a);
  });
  add(subjectPages[0]);
  if (subjectPages[0]) {
    const next = pages.find((p) => p.page === subjectPages[0].page + 1);
    if (next && /Specialized subject|専門科目|試験科目/i.test(next.text))
      add(next);
  }
  for (const term of [
    /出願期間|出願受付|Application Period/i,
    /出願資格|応募資格|Application criteria/i,
    /語学|TOEFL|TOEIC|IELTS|日本語/i,
    /選抜方法|選考方法|Selection Method/i,
    /合格発表|入学金|授業料|Announcement of Exam Results/i,
  ])
    add(usable.find((p) => term.test(p.text)));
  return [...result].slice(0, 10);
}

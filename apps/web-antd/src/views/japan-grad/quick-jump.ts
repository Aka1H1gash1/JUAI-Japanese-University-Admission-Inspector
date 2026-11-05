import type {
  GraduateSchool,
  Major,
  Professor,
  ResearchLab,
  University,
} from './explorer';

export type JumpKind = 'lab' | 'major' | 'professor' | 'school' | 'university';

export interface JumpEntry {
  id: string;
  kind: JumpKind;
  name: string;
  /** Parent chain shown under the name, e.g. 京都大学 / 情報学研究科 / 知能情報学専攻 */
  crumbs: string;
  path: string;
  wanted: boolean;
  /** Lower-cased text searched by the query terms. */
  haystack: string;
  /** Lower-cased own names (Chinese and Japanese/romaji), used for ranking. */
  title: string;
}

export interface JumpWorkspace {
  labs: ResearchLab[];
  majors: Major[];
  professors: Professor[];
  schools: GraduateSchool[];
  universities: University[];
}

export const KIND_LABELS: Record<JumpKind, string> = {
  lab: '研究室',
  professor: '老师',
  major: '专攻',
  school: '研究科',
  university: '大学',
};
const KIND_ORDER: JumpKind[] = [
  'lab',
  'professor',
  'major',
  'school',
  'university',
];

// Japanese shinjitai forms → simplified Chinese, so 情报 finds 情報 and 语言 finds 言語.
// Pairs of (Japanese, simplified) characters common in university, school and lab names.
const VARIANT_PAIRS =
  '報报語语処处図图発发経经済济機机電电気气環环総总応应実实験验際际関关係系東东識识規规計计専专講讲話话視视覚觉認认習习脳脑療疗薬药' +
  '農农業业産产営营築筑設设構构動动運运輸输変变換换術术芸艺楽乐歴历詞词訳译読读書书論论説说調调査查測测価价値值資资貿贸財财務务銀银' +
  '貨货幣币険险鉱矿鉄铁鋼钢銅铜線线縮缩網网絡络続续統统組组織织紀纪級级細细絵绘給给結结絶绝維维緑绿縁缘県县圏圈圧压塩盐壊坏売卖広广' +
  '庁厅廃废弁办従从徳德恵惠悪恶戦战戸户拡扩拠据挙举損损摂摄斉齐時时暦历権权様样標标橋桥歯齿毎每沢泽漢汉為为焼烧異异確确稲稻穏稳窓窗' +
  '粋粹糸丝紅红純纯紙纸終终絞绞練练縦纵聴听臓脏観观討讨記记許许評评試试詳详誌志誤误課课諸诸議议護护豊丰負负費费貴贵質质賞赏車车軍军' +
  '転转軽轻載载辺边進进遊游過过達达適适遺遗選选郷乡醸酿釈释針针録录鎖锁長长門门開开間间闘斗陽阳隣邻雑杂難难雲云霊灵響响頭头題题顔颜' +
  '類类風风飛飞養养館馆髪发魚鱼鳥鸟齢龄亜亚仏佛倹俭働动児儿円圆剤剂効效労劳勧劝単单厳严収收員员団团囲围堅坚場场増增宮宫対对導导尋寻' +
  '層层岡冈島岛帰归師师帯带幹干庫库強强彙汇復复徴征態态慣惯憶忆択择採采撃击敵敌昇升暁晓栄荣桜樱検检歓欢殻壳満满漁渔濃浓灘滩無无獣兽' +
  '疎疏盤盘砕碎禍祸穀谷積积競竞節节範范簡简粧妆';
const VARIANTS = new Map<string, string>(
  [...VARIANT_PAIRS.matchAll(/(.)(.)/gu)].map((m) => [m[1] ?? '', m[2] ?? '']),
);
const normalize = (value: string) =>
  [...value.toLowerCase()].map((c) => VARIANTS.get(c) ?? c).join('');
const text = (...values: (string | undefined)[]) =>
  normalize(values.filter(Boolean).join(' '));
const label = (item: { japaneseName?: string; name: string }) =>
  item.name || item.japaneseName || '未命名';

/** Every university, school, major, lab and professor with a direct link. */
export function buildJumpIndex(store: JumpWorkspace): JumpEntry[] {
  const entries: JumpEntry[] = [];
  const universities = new Map(store.universities.map((u) => [u.id, u]));
  const schools = new Map(store.schools.map((s) => [s.id, s]));
  const majors = new Map(store.majors.map((m) => [m.id, m]));
  const labs = new Map(store.labs.map((l) => [l.id, l]));
  for (const u of store.universities)
    entries.push({
      id: u.id,
      kind: 'university',
      name: label(u),
      crumbs: '',
      path: `/japan-grad/universities/${u.id}`,
      wanted: false,
      haystack: text(u.name, u.japaneseName),
      title: text(u.name, u.japaneseName),
    });
  for (const s of store.schools) {
    const u = universities.get(s.universityId);
    if (!u) continue;
    entries.push({
      id: s.id,
      kind: 'school',
      name: label(s),
      crumbs: label(u),
      path: `/japan-grad/universities/${u.id}/schools/${s.id}`,
      wanted: false,
      haystack: text(s.name, s.japaneseName, u.name, u.japaneseName),
      title: text(s.name, s.japaneseName),
    });
  }
  const majorBase = (m: Major) => {
    const s = schools.get(m.schoolId);
    const u = s && universities.get(s.universityId);
    return s && u
      ? {
          s,
          u,
          path: `/japan-grad/universities/${u.id}/schools/${s.id}/majors/${m.id}`,
        }
      : undefined;
  };
  for (const m of store.majors) {
    const base = majorBase(m);
    if (!base) continue;
    entries.push({
      id: m.id,
      kind: 'major',
      name: label(m),
      crumbs: `${label(base.u)} / ${label(base.s)}`,
      path: base.path,
      wanted: false,
      haystack: text(
        m.name,
        m.japaneseName,
        base.s.name,
        base.s.japaneseName,
        base.u.name,
        base.u.japaneseName,
      ),
      title: text(m.name, m.japaneseName),
    });
  }
  for (const l of store.labs) {
    const m = majors.get(l.majorId);
    const base = m && majorBase(m);
    if (!m || !base) continue;
    const people = store.professors.filter((p) => p.labId === l.id);
    entries.push({
      id: l.id,
      kind: 'lab',
      name: label(l),
      crumbs: `${label(base.u)} / ${label(base.s)} / ${label(m)}`,
      path: `${base.path}/labs/${l.id}`,
      wanted: Boolean(l.wantApply),
      haystack: text(
        l.name,
        l.japaneseName,
        l.research,
        m.name,
        m.japaneseName,
        base.s.name,
        base.u.name,
        base.u.japaneseName,
        ...people.flatMap((p) => [p.name, p.japaneseName]),
      ),
      title: text(l.name, l.japaneseName),
    });
  }
  for (const p of store.professors) {
    const lab = p.labId ? labs.get(p.labId) : undefined;
    const m = majors.get(lab?.majorId || p.majorId);
    const base = m && majorBase(m);
    if (!m || !base) continue;
    entries.push({
      id: p.id,
      kind: 'professor',
      name: label(p),
      crumbs: [label(base.u), label(m), lab && label(lab)]
        .filter(Boolean)
        .join(' / '),
      path: lab
        ? `${base.path}/labs/${lab.id}/professors/${p.id}`
        : `${base.path}/professors/${p.id}`,
      wanted: Boolean(lab?.wantApply),
      haystack: text(
        p.name,
        p.japaneseName,
        p.title,
        p.research,
        lab?.name,
        lab?.japaneseName,
        m.name,
        base.u.name,
        base.u.japaneseName,
      ),
      title: text(p.name, p.japaneseName),
    });
  }
  return entries;
}
/**
 * Every space-separated term must appear somewhere in the entry (name, parents,
 * research, professor names). Name hits rank first, then labs marked 想考, then kind.
 * An empty query lists labs, 想考 first.
 */
export function searchJump(
  entries: JumpEntry[],
  query: string,
  limit = 40,
): JumpEntry[] {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const byName = (a: JumpEntry, b: JumpEntry) =>
    a.name.localeCompare(b.name, 'zh-CN');
  if (terms.length === 0)
    return entries
      .filter((e) => e.kind === 'lab')
      .toSorted(
        (a, b) =>
          Number(b.wanted) - Number(a.wanted) ||
          a.crumbs.localeCompare(b.crumbs, 'zh-CN') ||
          byName(a, b),
      )
      .slice(0, limit);
  const score = (e: JumpEntry) => {
    const own = e.title;
    if (terms.every((t) => own.includes(t)))
      return own.startsWith(terms[0] ?? '') ? 0 : 1;
    return terms.some((t) => own.includes(t)) ? 2 : 3;
  };
  return entries
    .filter((e) => terms.every((t) => e.haystack.includes(t)))
    .map((e) => ({ e, s: score(e) }))
    .toSorted(
      (a, b) =>
        a.s - b.s ||
        Number(b.e.wanted) - Number(a.e.wanted) ||
        KIND_ORDER.indexOf(a.e.kind) - KIND_ORDER.indexOf(b.e.kind) ||
        byName(a.e, b.e),
    )
    .slice(0, limit)
    .map(({ e }) => e);
}

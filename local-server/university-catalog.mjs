import { existsSync, readFileSync } from 'node:fs';

// One public data source, packaged by the existing frontend build. No crawler.
const locations = [
  '../apps/web-antd/public/university-catalog/catalog.json',
  '../apps/web-antd/dist/university-catalog/catalog.json',
];
const file = locations
  .map((p) => new URL(p, import.meta.url))
  .find((p) => existsSync(p));
if (!file) throw new Error('缺少已发布大学目录，无法启动。');
export const universityCatalog = JSON.parse(
  readFileSync(file, 'utf8'),
).universities;
const normalize = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('學', '学')
    .replaceAll(/[\s\p{P}\p{S}]/gu, '');
export function catalogMatches(...names) {
  const keys = new Set(names.filter(Boolean).map((value) => normalize(value)));
  return universityCatalog.filter((u) =>
    [u.name, u.japaneseName, u.englishName, ...(u.aliases || [])].some(
      (n) => n && keys.has(normalize(n)),
    ),
  );
}
export function catalogUniversity(id) {
  return universityCatalog.find((u) => u.id === id);
}
export function validateCatalogLinks(data) {
  const seen = new Set();
  for (const u of data.universities || []) {
    if (!u.catalogId) continue;
    const row = catalogUniversity(u.catalogId);
    if (!row)
      throw Object.assign(new Error('大学目录标识不存在，请重新选择。'), {
        status: 400,
      });
    if (seen.has(row.id))
      throw Object.assign(new Error('这所大学已添加到当前工作区。'), {
        status: 409,
      });
    if (u.schoolCode && u.schoolCode !== row.schoolCode)
      throw Object.assign(new Error('大学学校代码与目录不符。'), {
        status: 400,
      });
    if (
      (data.universities || []).some(
        (other) =>
          other.id !== u.id &&
          !other.catalogId &&
          catalogMatches(other.name, other.japaneseName).length === 1 &&
          catalogMatches(other.name, other.japaneseName)[0].id === row.id,
      )
    )
      throw Object.assign(new Error('已有同一大学的旧记录，请关联已有记录。'), {
        status: 409,
      });
    seen.add(row.id);
  }
}

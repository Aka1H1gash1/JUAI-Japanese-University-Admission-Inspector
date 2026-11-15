import geography from '../../../../../local-server/japan-geography.json';

export const JAPAN_REGIONS = geography.map((item) => item.name);
export const JAPAN_PREFECTURES = geography.flatMap((item) =>
  item.prefectures.map(([name, japaneseName]) => ({
    name: name ?? '',
    japaneseName: japaneseName ?? '',
    region: item.name,
  })),
);

interface UniversityGeography {
  region?: string;
  prefecture?: string;
  location?: string;
}

const regionAliases: Record<string, string> = {
  東北: '东北',
  関東: '关东',
  關東: '关东',
  中國: '中国',
  四國: '四国',
  沖縄: '冲绳',
  沖繩: '冲绳',
};

function prefectureAliases(item: (typeof JAPAN_PREFECTURES)[number]) {
  return [...new Set([item.japaneseName, item.name])].flatMap((name) =>
    name === '北海道' ? [name] : [name, name.replace(/[都府县県]$/, '')],
  );
}

function findPrefecture(value: string) {
  return JAPAN_PREFECTURES.find((item) =>
    prefectureAliases(item).includes(value.trim()),
  );
}

/** Infer only missing legacy fields; an explicitly cleared prefecture stays empty. */
export function universityGeography(value: UniversityGeography) {
  const rawRegion = value.region?.trim() ?? '';
  const region = regionAliases[rawRegion] ?? rawRegion;
  if (value.prefecture !== undefined) {
    const prefecture = findPrefecture(value.prefecture);
    return {
      region: region || prefecture?.region || '',
      prefecture: prefecture?.name ?? value.prefecture,
    };
  }
  const location = value.location?.trim() ?? '';
  const prefecture =
    findPrefecture(location) ??
    JAPAN_PREFECTURES.find((item) =>
      [item.name, item.japaneseName].some((name) => location.startsWith(name)),
    );
  const combinedRegion = /^九州\s*[/／·・、和]\s*(?:冲绳|沖縄|沖繩)$/.test(
    region,
  );
  if (
    prefecture &&
    (!region ||
      region === prefecture.region ||
      (combinedRegion && ['九州', '冲绳'].includes(prefecture.region)))
  ) {
    return { region: prefecture.region, prefecture: prefecture.name };
  }
  return { region, prefecture: '' };
}

export function universityAddress(value: UniversityGeography) {
  const { prefecture } = universityGeography(value);
  const location = value.location?.trim() ?? '';
  if (!prefecture || !location) return prefecture || location;
  const match = findPrefecture(prefecture);
  if (match && prefectureAliases(match).includes(location)) return prefecture;
  if (
    match &&
    [match.name, match.japaneseName].some((name) => location.startsWith(name))
  )
    return location;
  return `${prefecture} / ${location}`;
}

export function universityLocation(value: UniversityGeography) {
  return [
    ...new Set([universityAddress(value), universityGeography(value).region]),
  ]
    .filter(Boolean)
    .join(' / ');
}

export function geographySearchTerms(value: UniversityGeography) {
  const { region, prefecture } = universityGeography(value);
  const match = findPrefecture(prefecture);
  return [region, prefecture, ...(match ? prefectureAliases(match) : [])];
}

export function geographyError(region: string, prefecture: string) {
  if (!prefecture) return '';
  const match = JAPAN_PREFECTURES.find((item) => item.name === prefecture);
  return match?.region === region
    ? ''
    : '请先选择所在地域，再选择该地域的都道府县。';
}

/** Compact display only; never writes inferred addresses back to records. */
export function universityCity(value: UniversityGeography) {
  let address = (value.location || '').trim();
  const { prefecture } = universityGeography(value);
  const known = findPrefecture(prefecture);
  if (known)
    for (const prefix of [known.name, known.japaneseName].toSorted(
      (a, b) => b.length - a.length,
    ))
      if (address.startsWith(prefix)) {
        address = address.slice(prefix.length).trim();
        break;
      }
  const city = address.match(
    /^(?:[\s/／,，]*)?([^\s\d/／,，-]{1,16}?(?:市|区|町|村))/u,
  )?.[1];
  if (city) return city;
  if (
    [
      '东京',
      '京都',
      '仙台',
      '名古屋',
      '大阪',
      '札幌',
      '東京',
      '横浜',
      '横滨',
      '神户',
      '神戸',
      '福冈',
      '福岡',
    ].includes(address)
  )
    return address;
  return '';
}
export function compactUniversityLocation(value: UniversityGeography) {
  return [universityGeography(value).region, universityCity(value)]
    .filter(Boolean)
    .join(' · ');
}

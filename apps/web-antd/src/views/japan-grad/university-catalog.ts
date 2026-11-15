import { ref } from 'vue';

export interface CatalogUniversity {
  id: string;
  schoolCode: string;
  address?: string;
  englishName?: string;
  name: string;
  japaneseName: string;
  category: string;
  prefecture: string;
  region: string;
  website: string;
  websiteSourceUrl?: string;
  websiteNotes?: string;
  aliases?: string[];
  logo: null | {
    url: string;
    sourceUrl: string;
    license: string;
    author: string;
  };
}

export const catalogUniversities = ref<CatalogUniversity[]>([]);
export const catalogLoading = ref(false);
export const catalogError = ref('');
let pending: Promise<void> | undefined;

export function loadUniversityCatalog() {
  if (pending) return pending;
  catalogLoading.value = true;
  catalogError.value = '';
  pending = (async () => {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}university-catalog/catalog.json`,
      );
      if (!response.ok) throw new Error('目录暂时无法读取，仍可手动填写大学。');
      const data = await response.json();
      if (!Array.isArray(data.universities))
        throw new Error('大学目录格式异常，仍可手动填写。');
      catalogUniversities.value = data.universities;
    } catch (error) {
      catalogError.value =
        error instanceof Error ? error.message : '大学目录加载失败。';
      pending = undefined;
    } finally {
      catalogLoading.value = false;
    }
  })();
  return pending;
}

function normalize(value: string) {
  return value.normalize('NFKC').replaceAll(/\s/g, '').toLowerCase();
}

export function matchCatalogUniversities(name: string) {
  const key = normalize(name);
  if (!key) return [];
  const matches = catalogUniversities.value.filter((item) =>
    [
      item.name,
      item.japaneseName,
      item.englishName || '',
      ...(item.aliases ?? []),
    ].some((value) => normalize(value) === key),
  );
  return matches;
}

export function findCatalogUniversity(name: string) {
  const matches = matchCatalogUniversities(name);
  return matches.length === 1 ? matches[0] : undefined;
}

export function catalogLogoUrl(logo: CatalogUniversity['logo']) {
  // Only bundled assets may be rendered; uploaded images use their existing API.
  return logo?.url.startsWith('/university-catalog/logos/')
    ? `${import.meta.env.BASE_URL}${logo.url.slice(1)}`
    : '';
}

export function universityDisplayGeography(value: {
  catalogId?: string;
  name: string;
  japaneseName?: string;
  location?: string;
  region?: string;
  prefecture?: string;
}) {
  if (value.location?.trim()) return value;
  const record = value.catalogId
    ? catalogUniversities.value.find((item) => item.id === value.catalogId)
    : findCatalogUniversity(value.japaneseName || value.name);
  if (!record) return value;
  return {
    ...value,
    region: value.region || record.region,
    prefecture: value.prefecture || record.prefecture,
    location: record.address || '',
  };
}

export const UNIVERSITY_CATEGORIES = ['国立', '私立', '公立', '国公立'];

export const DEFAULT_UNIVERSITY_FEES = {
  admissionFee: '282000',
  annualTuition: '535800',
};

interface UniversityFees {
  category: string;
  admissionFee?: string;
  annualTuition?: string;
  monthlyRent?: string;
  monthlyLivingExpenses?: string;
}

export const UNIVERSITY_BUDGET_FIELDS = [
  'admissionFee',
  'annualTuition',
  'monthlyRent',
  'monthlyLivingExpenses',
] as const;

export const DORMITORY_OPTIONS = [
  { value: 'unknown', label: '待确认' },
  { value: 'available', label: '可申请' },
  { value: 'unavailable', label: '不可申请' },
];

export function dormitoryLabel(status: string) {
  return (
    DORMITORY_OPTIONS.find((option) => option.value === status)?.label ??
    '待确认'
  );
}

export function normalizeUniversityCategory(category: string) {
  return category === '国立公立' ? '国公立' : category;
}

export function hasDefaultUniversityFees(category: string) {
  return ['国立', '公立', '国公立'].includes(
    normalizeUniversityCategory(category),
  );
}

// Only missing fields receive defaults. An explicitly cleared amount stays empty.
export function universityFees(university: UniversityFees) {
  const defaults = hasDefaultUniversityFees(university.category)
    ? DEFAULT_UNIVERSITY_FEES
    : { admissionFee: '', annualTuition: '' };
  return {
    admissionFee: university.admissionFee ?? defaults.admissionFee,
    annualTuition: university.annualTuition ?? defaults.annualTuition,
  };
}

export function validYenAmount(value: string) {
  return /^(?:\d{1,9})?$/.test(value);
}

export function universityFeeTotals(university: UniversityFees) {
  const { admissionFee, annualTuition } = universityFees(university);
  if (
    admissionFee === '' ||
    annualTuition === '' ||
    !validYenAmount(admissionFee) ||
    !validYenAmount(annualTuition)
  )
    return { firstYear: '', twoYears: '' };
  return {
    firstYear: String(Number(admissionFee) + Number(annualTuition)),
    twoYears: String(Number(admissionFee) + Number(annualTuition) * 2),
  };
}

export function universityBudgetTotals(university: UniversityFees) {
  const amounts = {
    ...universityFees(university),
    monthlyRent: university.monthlyRent ?? '',
    monthlyLivingExpenses: university.monthlyLivingExpenses ?? '',
  };
  const labels = {
    admissionFee: '入学金',
    annualTuition: '年度学费',
    monthlyRent: '房租',
    monthlyLivingExpenses: '生活费',
  };
  const missingFields = UNIVERSITY_BUDGET_FIELDS.filter(
    (field) => amounts[field] === '' || !validYenAmount(amounts[field]),
  ).map((field) => labels[field]);
  const known = (field: keyof typeof amounts) =>
    amounts[field] !== '' && validYenAmount(amounts[field])
      ? Number(amounts[field])
      : 0;
  const annualRecurring =
    known('annualTuition') +
    (known('monthlyRent') + known('monthlyLivingExpenses')) * 12;
  const hasAmounts = missingFields.length < UNIVERSITY_BUDGET_FIELDS.length;
  return {
    firstYear: hasAmounts
      ? String(known('admissionFee') + annualRecurring)
      : '',
    twoYears: hasAmounts
      ? String(known('admissionFee') + annualRecurring * 2)
      : '',
    complete: missingFields.length === 0,
    missingFields,
  };
}

export function formatYen(value: string) {
  return value === '' ? '待填写' : Number(value).toLocaleString('ja-JP');
}

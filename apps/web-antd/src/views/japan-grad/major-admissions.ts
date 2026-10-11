export interface MajorAdmissionFields {
  applicationStart: string;
  applicationEnd: string;
  applicationMaterials: string;
}

export const MAJOR_ADMISSION_LIMITS = {
  applicationStart: 120,
  applicationEnd: 120,
  applicationMaterials: 8000,
};

export function validAdmissionFields(value: Partial<MajorAdmissionFields>) {
  return (
    Object.keys(MAJOR_ADMISSION_LIMITS) as (keyof MajorAdmissionFields)[]
  ).every(
    (key) =>
      value[key] === undefined ||
      (typeof value[key] === 'string' &&
        value[key].length <= MAJOR_ADMISSION_LIMITS[key]),
  );
}

export function admissionRangeError(fields: MajorAdmissionFields) {
  if (!validAdmissionFields(fields))
    return '出愿时间或材料内容过长，请精简后保存。';
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(fields.applicationStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(fields.applicationEnd) &&
    fields.applicationStart > fields.applicationEnd
  )
    return '出愿截止日期不能早于开始日期。';
  return '';
}

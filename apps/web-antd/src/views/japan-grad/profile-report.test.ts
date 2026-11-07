/* oxlint-disable typescript/no-non-null-assertion -- Fixed nonempty fixtures and ZIP entries are asserted in these tests. */
import type { LabTarget } from './lab-targets';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  buildProfileReport,
  foreignStudentLabel,
  targetReportStage,
} from './profile-report';
import { createProfileWorkbook } from './profile-report-files';
import { createProfilePdf } from './profile-report-pdf';

const t = {
  university: {
    id: 'u1',
    name: '北海道大学',
    japaneseName: '北海道大学',
    category: '国公立',
    location: '札幌',
    qsRank: '100',
    qsYear: '2027',
    admissionFee: '282000',
    annualTuition: '535800',
    monthlyRent: '40000',
    monthlyLivingExpenses: '50000',
    website: 'https://example.com',
    notes: '大学备注',
  },
  school: { id: 's1', name: '情報科学院' },
  major: {
    id: 'm1',
    name: '情報理工学コース',
    languageRequirements: 'TOEFL iBT',
    applicationStart: '2027-01-01',
    applicationEnd: '2027-01-12',
    applicationMaterials: '成绩单\n研究计划书',
    examHistory: [
      {
        year: '2027',
        session: '修士',
        subjects: '数学、算法',
        writtenDate: '2027-02-01',
        interviewDate: '2027-02-02',
        examDate: '',
        resultDate: '',
        notes: '',
        sourceUrl: '',
      },
    ],
  },
  lab: {
    id: 'l1',
    name: '知識処理研究室',
    research: '知识图谱 / Knowledge representation',
    website: 'https://example.com/lab',
    languageRequirements: '',
    tasks: [{ kind: 'material', title: '研究计划', progress: 60 }],
    notes: '研究室记录',
    wantApply: true,
  },
  professors: [
    {
      id: 'p1',
      name: '山田先生',
      title: '教授',
      email: 'teacher@example.com',
      contact: {
        status: 'consent',
        consentDate: '2026-12-01',
        interviewNotes: '不应出现在出愿阶段摘要',
      },
    },
  ],
} as unknown as LabTarget;

describe('stage-aware profile reports', () => {
  it('keeps unknown foreign-student status distinct from no, and uses inherited language', () => {
    expect(foreignStudentLabel()).toBe('待确认');
    expect(foreignStudentLabel('no')).toBe('无');
    expect(targetReportStage(t)).toBe('application');
    const report = buildProfileReport({
      scope: 'favorites',
      detail: 'stage',
      stage: 'auto',
      year: 'latest',
      targets: [t],
      now: new Date('2026-11-07T00:00:00Z'),
    });
    expect(report.records[0]?.stage).toBe('内诺与出愿');
    const values = JSON.stringify(report);
    expect(values).toContain('研究计划');
    expect(values).toContain('TOEFL iBT');
    expect(values).not.toContain('不应出现在出愿阶段摘要');
    const interview = buildProfileReport({
      scope: 'favorites',
      detail: 'stage',
      stage: 'interview',
      year: 'latest',
      targets: [t],
    });
    expect(JSON.stringify(interview)).toContain('不应出现在出愿阶段摘要');
  });
  it('exports each scope with a useful summary and safe text cells', async () => {
    const report = buildProfileReport({
      scope: 'shortlist',
      detail: 'overview',
      stage: 'auto',
      year: 'latest',
      targets: [
        { ...t, lab: { ...t.lab, notes: '=HYPERLINK("https://invalid")' } },
      ],
    });
    const files = unzipSync(createProfileWorkbook(report));
    expect(strFromU8(files['xl/worksheets/sheet1.xml']!)).toContain(
      'inlineStr',
    );
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('备选研究室');
    expect(strFromU8(files['xl/styles.xml']!)).toContain('FF203252');
    const uni = buildProfileReport({
      scope: 'university',
      detail: 'overview',
      stage: 'auto',
      year: 'latest',
      universities: [t.university],
      schoolNames: () => ['情報科学院'],
    });
    expect(uni.rows[0]?.[5]).toBe(282_000);
    const out = path.join(tmpdir(), 'juai-report-validation');
    await mkdir(out, { recursive: true });
    await writeFile(
      path.join(out, 'universities.xlsx'),
      createProfileWorkbook(uni),
    );
    await writeFile(
      path.join(out, 'shortlist.xlsx'),
      createProfileWorkbook(report),
    );
  });
  it('generates an actual embedded CJK PDF with measured page breaks', async () => {
    const report = buildProfileReport({
      scope: 'favorites',
      detail: 'detailed',
      stage: 'interview',
      year: 'latest',
      targets: [
        {
          ...t,
          professors: [
            {
              ...t.professors[0]!,
              contact: {
                ...t.professors[0]!.contact!,
                interviewNotes: '面试记录与研究计划核对。'.repeat(350),
              },
            },
          ],
        },
      ],
    });
    const font = await readFile(
      path.resolve('apps/web-antd/public/fonts/NotoSansSC-Regular.ttf'),
    );
    const bytes = await createProfilePdf(report, font);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toContain('心仪研究室');
    const out = path.join(tmpdir(), 'juai-report-validation');
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'favorites.pdf'), bytes);
    await writeFile(
      path.join(out, 'favorites.xlsx'),
      createProfileWorkbook(report),
    );
  }, 30_000);
});

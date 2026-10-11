import { crc32 } from 'node:zlib';

export const sampleData = {
  version: 2,
  universities: [
    {
      id: 'u1',
      name: '测试大学',
      japaneseName: '',
      location: '东京',
      category: '国公立',
      region: '关东',
      qsRank: '100',
      qsYear: '2027',
      website: '',
      notes: '',
    },
  ],
  schools: [
    {
      id: 's1',
      universityId: 'u1',
      name: '研究科',
      japaneseName: '',
      research: '',
      website: '',
      notes: '',
    },
  ],
  majors: [
    {
      id: 'm1',
      schoolId: 's1',
      name: '专攻',
      japaneseName: '',
      research: '',
      website: '',
      notes: '',
    },
  ],
  professors: [
    {
      id: 'p1',
      majorId: 'm1',
      name: '老师',
      japaneseName: '',
      title: '教授',
      research: '',
      laboratory: '',
      email: '',
      personalWebsite: '',
      laboratoryWebsite: '',
      notes: '',
      favorite: false,
    },
  ],
};
export function samplePdf(
  lines = [
    'Examination subjects: Mathematics and English',
    'Examination scope: Linear algebra',
    'Examination date: 2027-06-20',
  ],
  japanese = false,
) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  ];
  objects.push(
    japanese
      ? '<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiMin-W3 /Encoding /UniJIS-UCS2-H /DescendantFonts [6 0 R] >>'
      : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );
  const printable = (line) =>
    japanese
      ? `<${[...line].map((c) => (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join('')}>`
      : `(${line.replaceAll(/[\\()]/g, String.raw`\$&`)})`;
  const stream = `BT /F1 12 Tf 50 780 Td 22 TL ${lines.map((line, index) => `${index ? 'T* ' : ''}${printable(line)} Tj`).join('\n')} ET`;
  objects.push(
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  );
  if (japanese)
    objects.push(
      '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiMin-W3 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /DW 1000 >>',
    );
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}

export function sampleDocx() {
  const parts = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>募集要项资料</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
    ],
  ];
  const local = [];
  const central = [];
  let offset = 0;
  for (const [filename, source] of parts) {
    const name = Buffer.from(filename);
    const content = Buffer.from(source);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(67_324_752);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(content), 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, content);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(33_639_248);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc32(content), 16);
    directory.writeUInt32LE(content.length, 20);
    directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + content.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(101_010_256);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

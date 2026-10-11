/* oxlint-disable unicorn/text-encoding-identifier-case -- HTTP Content-Type uses canonical UTF-8 charset names. */
import path from 'node:path';

const formats = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
};

function wordPackageNames(content) {
  // Check ZIP directory names without unpacking or executing uploaded content.
  const minimum = Math.max(0, content.length - 65_557);
  for (let end = content.length - 22; end >= minimum; end--) {
    if (content.readUInt32LE(end) !== 101_010_256) continue;
    if (end + 22 + content.readUInt16LE(end + 20) !== content.length) continue;
    const count = content.readUInt16LE(end + 10);
    let position = content.readUInt32LE(end + 16);
    const names = new Set();
    if (position + content.readUInt32LE(end + 12) > end) return names;
    for (let index = 0; index < count; index++) {
      if (position + 46 > end || content.readUInt32LE(position) !== 33_639_248)
        return new Set();
      const length = content.readUInt16LE(position + 28);
      const next =
        position +
        46 +
        length +
        content.readUInt16LE(position + 30) +
        content.readUInt16LE(position + 32);
      if (next > end) return new Set();
      names.add(
        content
          .subarray(position + 46, position + 46 + length)
          .toString('utf8'),
      );
      position = next;
    }
    return names;
  }
  return new Set();
}

export function fileProperties(filename) {
  const extension = path.extname(filename).toLowerCase();
  const mimeType = formats[extension];
  if (!mimeType) throw new Error('支持 PDF、DOC、DOCX、MD、TXT 文件。');
  return { extension, mimeType };
}

export function validateFile(filename, content) {
  const properties = fileProperties(filename);
  if (content.length === 0) throw new Error('请选择非空文件。');
  if (
    properties.extension === '.pdf' &&
    !content.subarray(0, 1024).includes(Buffer.from('%PDF-'))
  )
    throw new Error('文件内容不是有效的 PDF。');
  if (properties.extension === '.doc') {
    const ole = Buffer.from('d0cf11e0a1b11ae1', 'hex');
    if (
      !content.subarray(0, 8).equals(ole) &&
      !content
        .subarray(0, 16)
        .toString()
        .trimStart()
        .startsWith(String.raw`{\rtf`)
    )
      throw new Error('文件内容不是有效的 DOC / RTF 文档。');
  }
  if (properties.extension === '.docx') {
    const names = wordPackageNames(content);
    if (!names.has('[Content_Types].xml') || !names.has('word/document.xml'))
      throw new Error('文件内容不是有效的 DOCX 文档。');
  }
  let charset = '';
  if (properties.extension === '.md' || properties.extension === '.txt') {
    if (content.subarray(0, 2).equals(Buffer.from([255, 254])))
      charset = 'utf-16le';
    else if (content.subarray(0, 2).equals(Buffer.from([254, 255])))
      charset = 'utf-16be';
    else {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(content);
        charset = 'utf-8';
      } catch {
        charset = 'unknown';
      }
    }
  }
  return { ...properties, charset };
}

export function deliveryProperties(record, download = false) {
  const properties = fileProperties(record.filename);
  const word =
    properties.extension === '.doc' || properties.extension === '.docx';
  const plainText =
    properties.extension === '.md' || properties.extension === '.txt';
  const attachment = download || word || record.charset === 'unknown';
  let contentType = properties.mimeType;
  if (plainText)
    contentType = `text/plain; charset=${record.charset && record.charset !== 'unknown' ? record.charset : 'utf-8'}`;
  return {
    contentType,
    disposition: attachment ? 'attachment' : 'inline',
    plainText,
  };
}

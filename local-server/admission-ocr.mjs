import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function execute(command, args, input, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      signal,
    });
    let errorText = '';
    let output = '';
    let size = 0;
    const timer = setTimeout(() => child.kill(), 60_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 3 * 1024 * 1024) child.kill();
      else output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      errorText = (errorText + chunk.toString('utf8')).slice(-1000);
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              signal?.aborted
                ? 'OCR 已停止。'
                : `OCR 未完成，请检查识别组件或改用图片模型。${errorText.slice(0, 200)}`,
            ),
          );
    });
    child.stdin.end(input);
  });
}
export function createAdmissionOcr() {
  let cached;
  async function engine() {
    if (cached) return cached;
    const binary = fileURLToPath(new URL('bin/juai-ocr', import.meta.url));
    if (process.platform === 'darwin') {
      try {
        await access(binary, constants.X_OK);
        return (cached = {
          name: 'macOS Vision（日语 / 英语，本机识别）',
          command: binary,
          type: 'vision',
        });
      } catch {}
    }
    const candidates = [
      ...(process.env.PATH || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map((dir) =>
          path.join(
            dir,
            process.platform === 'win32' ? 'tesseract.exe' : 'tesseract',
          ),
        ),
      '/opt/homebrew/bin/tesseract',
      '/usr/local/bin/tesseract',
    ];
    for (const command of new Set(candidates)) {
      try {
        await access(command, constants.X_OK);
        const languages = await execute(command, ['--list-langs']);
        if (languages.split(/\r?\n/).some((line) => line.trim() === 'jpn'))
          return (cached = {
            name: 'Tesseract（日语，本机识别）',
            command,
            type: 'tesseract',
            english: /\beng\b/.test(languages),
          });
      } catch {}
    }
    return { name: '', type: 'unavailable' };
  }
  return {
    async status() {
      const value = await engine();
      return { available: value.type !== 'unavailable', name: value.name };
    },
    async read(image, signal) {
      const value = await engine();
      if (value.type === 'unavailable')
        throw new Error(
          '未找到支持日语的本机 OCR，请使用图片模型，或安装带 jpn 语言包的 Tesseract 后重启。',
        );
      const input = Buffer.from(image, 'base64');
      if (value.type === 'vision') {
        const result = JSON.parse(
          await execute(value.command, [], input, signal),
        );
        if (typeof result.text !== 'string')
          throw new Error('OCR 没有返回有效文字。');
        return result.text;
      }
      return execute(
        value.command,
        [
          'stdin',
          'stdout',
          '-l',
          value.english ? 'jpn+eng' : 'jpn',
          '--psm',
          '3',
        ],
        input,
        signal,
      );
    },
  };
}

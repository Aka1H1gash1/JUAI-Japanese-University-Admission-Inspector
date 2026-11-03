// Legacy summaries used top-level separators. Keep requirements and alternatives
// inside parentheses attached to their own item; never split TOEIC/TOEFL/IELTS.
export function admissionItems(value: string, materials = true): string[] {
  const result: string[] = [];
  let text = '';
  const stack: string[] = [];
  const closing: Record<string, string> = {
    '(': ')',
    '（': '）',
    '[': ']',
    '【': '】',
  };
  const flush = () => {
    const item = text
      .trim()
      .replace(/^(?:[-*•・]\s*|\d+[.)、．]\s*|[①-⑳]\s*)/u, '')
      .trim();
    if (item) result.push(item);
    text = '';
  };
  for (const character of value.replaceAll('\r', '')) {
    if (closing[character]) stack.push(closing[character]);
    else if (character === stack.at(-1)) stack.pop();
    if (
      stack.length === 0 &&
      (character === '\n' ||
        character === ';' ||
        character === '；' ||
        (materials && character === '、'))
    )
      flush();
    else text += character;
  }
  flush();
  return result;
}

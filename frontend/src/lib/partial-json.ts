/**
 * Tolerant parser for JSON that may be truncated mid-structure or wrapped in
 * prose. Ported from the Anthropic SDK's `partial-json-parser`.
 *
 * It tokenizes the input, strips a trailing incomplete token, closes any
 * dangling `{` / `[` structures, and JSON.parses the result. Returns the
 * parsed value for the longest recoverable prefix, or `null`.
 */

type Tok = {
  type: 'brace' | 'paren' | 'separator' | 'delimiter' | 'string' | 'number' | 'name';
  value: string;
};

const WHITESPACE = /\s/;
const NUMBERS = /[0-9]/;
const LETTERS = /[a-z]/i;

function tokenize(input: string): Tok[] {
  const tokens: Tok[] = [];
  let current = 0;

  while (current < input.length) {
    let char = input[current]!;

    if (char === '\\') {
      current++;
      continue;
    }
    if (char === '{' || char === '}') {
      tokens.push({ type: 'brace', value: char });
      current++;
      continue;
    }
    if (char === '[' || char === ']') {
      tokens.push({ type: 'paren', value: char });
      current++;
      continue;
    }
    if (char === ':') {
      tokens.push({ type: 'separator', value: char });
      current++;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'delimiter', value: char });
      current++;
      continue;
    }
    if (char === '"') {
      let value = '';
      let danglingQuote = false;
      char = input[++current]!;
      while (char !== '"') {
        if (current >= input.length) {
          danglingQuote = true;
          break;
        }
        if (char === '\\') {
          current++;
          if (current >= input.length) {
            danglingQuote = true;
            break;
          }
          value += char + input[current];
          char = input[++current]!;
        } else {
          value += char;
          char = input[++current]!;
        }
      }
      current++;
      if (!danglingQuote) {
        tokens.push({ type: 'string', value });
      }
      continue;
    }
    if (char && WHITESPACE.test(char)) {
      current++;
      continue;
    }
    if ((char && NUMBERS.test(char)) || char === '-' || char === '.') {
      let value = '';
      if (char === '-') {
        value += char;
        char = input[++current]!;
      }
      while ((char && NUMBERS.test(char)) || char === '.') {
        value += char;
        char = input[++current]!;
      }
      tokens.push({ type: 'number', value });
      continue;
    }
    if (char && LETTERS.test(char)) {
      let value = '';
      while (char && LETTERS.test(char) && current < input.length) {
        value += char;
        char = input[++current]!;
      }
      if (value === 'true' || value === 'false' || value === 'null') {
        tokens.push({ type: 'name', value });
      }
      continue;
    }
    current++;
  }
  return tokens;
}

function strip(tokens: Tok[]): Tok[] {
  if (tokens.length === 0) return tokens;
  const lastToken = tokens[tokens.length - 1]!;
  switch (lastToken.type) {
    case 'separator':
    case 'delimiter':
      return strip(tokens.slice(0, tokens.length - 1));
    case 'number': {
      const lastChar = lastToken.value[lastToken.value.length - 1];
      if (lastChar === '.' || lastChar === '-') {
        return strip(tokens.slice(0, tokens.length - 1));
      }
      return tokens;
    }
    case 'string': {
      const before = tokens[tokens.length - 2];
      if (before?.type === 'delimiter') {
        return strip(tokens.slice(0, tokens.length - 1));
      }
      if (before?.type === 'brace' && before.value === '{') {
        return strip(tokens.slice(0, tokens.length - 1));
      }
      return tokens;
    }
    default:
      return tokens;
  }
}

function unstrip(tokens: Tok[]): Tok[] {
  const tail: string[] = [];
  for (const token of tokens) {
    if (token.type === 'brace') {
      if (token.value === '{') tail.push('}');
      else {
        const idx = tail.lastIndexOf('}');
        if (idx >= 0) tail.splice(idx, 1);
      }
    }
    if (token.type === 'paren') {
      if (token.value === '[') tail.push(']');
      else {
        const idx = tail.lastIndexOf(']');
        if (idx >= 0) tail.splice(idx, 1);
      }
    }
  }
  if (tail.length > 0) {
    tail.reverse().forEach((item) => {
      tokens.push({ type: item === '}' ? 'brace' : 'paren', value: item });
    });
  }
  return tokens;
}

function generate(tokens: Tok[]): string {
  let output = '';
  for (const token of tokens) {
    output += token.type === 'string' ? `"${token.value}"` : token.value;
  }
  return output;
}

/**
 * Best-effort JSON.parse that tolerates truncation. Returns the parsed value
 * or null when nothing recoverable was found.
 */
export function partialParse(input: string): unknown | null {
  if (!input) return null;
  const trimmed = input.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch { /* fall through to tolerant parse */ }
  const start = trimmed.search(/[[{]/);
  if (start < 0) return null;
  const slice = trimmed.slice(start);
  try {
    return JSON.parse(generate(unstrip(strip(tokenize(slice)))));
  } catch {
    return null;
  }
}
import { describe, expect, it } from 'vitest';

import { parseRawJson, toRawUtf8Json } from './raw-json.js';

describe('raw JSON boundary', () => {
  it('accepts only lossless UTF-8 buffers and parses valid JSON safely', () => {
    const json = '{"message":"xin chào 👋"}';
    const raw = Buffer.from(json, 'utf8');

    expect(toRawUtf8Json(raw)).toBe(json);
    expect(parseRawJson(json)).toEqual({ message: 'xin chào 👋' });
  });

  it('fails closed for non-buffer, invalid UTF-8, and malformed JSON values', () => {
    expect(toRawUtf8Json('{"message":"not raw"}')).toBeUndefined();
    expect(toRawUtf8Json(Buffer.from([0xff, 0xfe]))).toBeUndefined();
    expect(parseRawJson('{"message":')).toBeUndefined();
  });
});

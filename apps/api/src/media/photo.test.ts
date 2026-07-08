import { describe, expect, it } from 'vitest';
import { decodePhotoUpload } from './photo';

// 1x1 PNG (Base64), gültiges kleines Bild.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('decodePhotoUpload', () => {
  it('dekodiert ein gültiges PNG', () => {
    const { contentType, data } = decodePhotoUpload({ contentType: 'image/png', dataBase64: PNG_1x1 });
    expect(contentType).toBe('image/png');
    expect(data.length).toBeGreaterThan(0);
    // PNG-Signatur.
    expect(data.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('akzeptiert einen data:-URL-Präfix', () => {
    const { data } = decodePhotoUpload({
      contentType: 'image/png',
      dataBase64: `data:image/png;base64,${PNG_1x1}`,
    });
    expect(data.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('lehnt einen unerlaubten Content-Type ab', () => {
    expect(() => decodePhotoUpload({ contentType: 'image/gif', dataBase64: PNG_1x1 })).toThrow();
  });

  it('lehnt ein zu großes Bild ab', () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1).toString('base64');
    expect(() => decodePhotoUpload({ contentType: 'image/jpeg', dataBase64: big })).toThrow(/groß/);
  });

  it('lehnt leere Daten ab', () => {
    expect(() => decodePhotoUpload({ contentType: 'image/png', dataBase64: '' })).toThrow();
  });
});

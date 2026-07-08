import { BadRequestException } from '@nestjs/common';
import { PHOTO_MAX_BYTES, employeePhotoUploadSchema } from '@zeitvault/types';

/**
 * Validiert und dekodiert einen Foto-Upload (Base64). Akzeptiert optional einen
 * `data:`-URL-Präfix. Erzwingt erlaubte Content-Types (über das Zod-Schema) und
 * die Größengrenze. Reines Modul – ohne DB/HTTP, damit unit-testbar.
 */
export function decodePhotoUpload(body: unknown): { contentType: string; data: Buffer } {
  const parsed = employeePhotoUploadSchema.parse(body);
  const base64 = parsed.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
  const data = Buffer.from(base64, 'base64');
  if (data.length === 0) throw new BadRequestException('Leeres oder ungültiges Bild.');
  if (data.length > PHOTO_MAX_BYTES) {
    throw new BadRequestException('Bild zu groß (max. 2 MiB). Bitte verkleinern.');
  }
  return { contentType: parsed.contentType, data };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type EmployeeSummary,
  deleteEmployeePhoto,
  fetchEmployeePhotoUrl,
  uploadEmployeePhoto,
} from '@/lib/api';
import type { Identity } from '@/lib/identity';

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '·';
}

/**
 * Verkleinert ein Bild clientseitig auf max. `max` px Kantenlänge und liefert
 * JPEG-Base64. Hält den Upload klein (< 2 MiB Servergrenze) und quadratisch-nah.
 */
async function resizeImage(file: File, max = 512): Promise<{ contentType: string; dataBase64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { contentType: 'image/jpeg', dataBase64: dataUrl.split(',')[1] ?? '' };
}

/** Nur-Anzeige-Avatar: lädt das Foto (falls vorhanden), sonst Initialen. */
export function EmployeePhotoAvatar({
  identity,
  employee,
  size = 36,
  refreshKey = 0,
}: {
  identity: Identity;
  employee: Pick<EmployeeSummary, 'id' | 'displayName' | 'hasPhoto'>;
  size?: number;
  refreshKey?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const revoke = () => {
      if (ref.current) {
        URL.revokeObjectURL(ref.current);
        ref.current = null;
      }
    };
    if (!employee.hasPhoto) {
      revoke();
      setUrl(null);
      return () => revoke();
    }
    fetchEmployeePhotoUrl(identity, employee.id)
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        revoke();
        ref.current = u;
        setUrl(u);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      revoke();
    };
  }, [identity, employee.id, employee.hasPhoto, refreshKey]);

  if (url) {
    return (
      <img
        src={url}
        alt={employee.displayName}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-full bg-gradient-to-br from-primary to-teal font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(employee.displayName)}
    </span>
  );
}

/** Avatar + Upload-/Entfernen-Steuerung für die Verwaltung. */
export function EmployeePhotoEditor({
  identity,
  employee,
  onChanged,
}: {
  identity: Identity;
  employee: Pick<EmployeeSummary, 'id' | 'displayName' | 'hasPhoto'>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        const img = await resizeImage(file);
        await uploadEmployeePhoto(identity, employee.id, img);
        setLocalKey((k) => k + 1);
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message.replace(/^HTTP \d+:\s*/, '') : 'Upload fehlgeschlagen.');
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [identity, employee.id, onChanged],
  );

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteEmployeePhoto(identity, employee.id);
      setLocalKey((k) => k + 1);
      onChanged();
    } catch {
      setError('Entfernen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }, [identity, employee.id, onChanged]);

  return (
    <div className="flex items-center gap-4">
      <EmployeePhotoAvatar identity={identity} employee={employee} size={64} refreshKey={localKey} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-[10px] bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? '…' : employee.hasPhoto ? 'Foto ändern' : 'Foto hochladen'}
          </button>
          {employee.hasPhoto && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-[10px] border border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
            >
              Entfernen
            </button>
          )}
        </div>
        <p className="text-[11px] text-ink-faint">JPG/PNG/WebP, wird auf 512 px verkleinert. Anzeige beim Stempeln.</p>
        {error && <p className="text-[12px] text-neg">{error}</p>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </div>
  );
}

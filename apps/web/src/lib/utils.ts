import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Kombiniert Klassennamen und loest Tailwind-Konflikte auf. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

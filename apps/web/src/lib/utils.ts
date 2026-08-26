import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes safely.
 * `clsx` handles conditionals; `twMerge` resolves conflicts so a later class
 * wins (e.g. cn("p-2", "p-4") → "p-4" rather than both fighting).
 * This is the standard helper every shadcn/ui component expects.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

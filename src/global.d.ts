/**
 * Sprint 19.9 — global type augmentations.
 *
 * `IntlMessages` makes useTranslations() type-safe — a typo like
 * t("dashboar.title") becomes a TypeScript error instead of a
 * runtime empty-string. The compiler reads de.json's shape at
 * build time and uses it as the source of truth; en.json must
 * match the same shape (asserted by a test in Phase H).
 */
import type messages from "../messages/de.json";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Omit<typeof messages, never> {}
}

export {};

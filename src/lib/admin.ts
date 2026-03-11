// Admin-Erkennung via Environment-Variable
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export function isAdmin(userId: string): boolean {
  return ADMIN_USER_IDS.includes(userId);
}

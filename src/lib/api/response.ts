/**
 * Standardisierte API-Fehler-Antwort.
 *
 * `error` bleibt bewusst ein STRING — kompatibel mit den ~95% der Routen und
 * dem Frontend, das `data.error` durchgängig als String liest (Toasts,
 * `new Error(data.error)` etc.). Ein verschachteltes `{ error: { message } }`
 * würde diese Consumer brechen.
 *
 * Ein optionaler `code` wird nur ADDITIV ergänzt (maschinenlesbarer Fehlercode),
 * ohne die bestehende `{ error: string }`-Form zu verändern.
 *
 * Beispiel:
 *   return apiError("Unauthorized", 401);
 *   return apiError("Insufficient permission", 403, "FORBIDDEN");
 */
export function apiError(message: string, status: number, code?: string): Response {
  return Response.json(
    code ? { error: message, code } : { error: message },
    { status },
  );
}

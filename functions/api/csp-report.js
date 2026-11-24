// JOURNAL-CSP-01 Phase 2b: CSP violation reports (report-uri and Reporting API).
// All logic, limits and the privacy boundary: functions/_shared/csp-report-core.js.
import { handle } from '../_shared/csp-report-core.js';

export async function onRequest(context) {
  return handle(context.request, context.env);
}

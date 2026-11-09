// Email routing is separate from administrator permissions. Callers must query
// admin accounts before passing rows here; this helper does not grant any role.
const CENTRAL_DEPARTMENTS = new Set(['ทุกภาควิชา / ส่วนกลาง', 'สำนักงานคณะ']);
const EMAIL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeEmail(value) {
  const email = normalizeText(value);
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : '';
}

/**
 * Select recipients for a role:admin email without changing application access.
 * Blank or explicitly central departments receive every department's events.
 * An event without a department retains the existing all-admin broadcast.
 * The returned array preserves first occurrence order and never mutates inputs.
 */
export function selectAdminNotificationEmails(admins, department, superAdminEmails = []) {
  const eventDepartment = normalizeText(department);
  const superEmails = new Set(
    (Array.isArray(superAdminEmails) ? superAdminEmails : []).map(normalizeEmail).filter(Boolean),
  );
  const selected = new Set();

  for (const admin of Array.isArray(admins) ? admins : []) {
    const email = normalizeEmail(admin?.email);
    if (!email) continue;

    const adminDepartment = normalizeText(admin?.department);
    if (!eventDepartment || superEmails.has(email) || !adminDepartment
      || CENTRAL_DEPARTMENTS.has(adminDepartment) || adminDepartment === eventDepartment) {
      selected.add(email);
    }
  }

  return [...selected];
}

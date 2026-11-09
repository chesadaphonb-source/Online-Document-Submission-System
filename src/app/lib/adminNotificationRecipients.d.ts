export interface AdminNotificationAccount {
  email?: string | null;
  department?: string | null;
}

/** Rows must already be restricted to administrator accounts by the caller. */
export function selectAdminNotificationEmails(
  admins: readonly AdminNotificationAccount[] | null | undefined,
  department?: string | null,
  superAdminEmails?: readonly string[],
): string[];

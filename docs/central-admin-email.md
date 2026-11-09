# Central Admin email routing

Admin email recipients now follow their department scope independently of Super Admin capabilities. A blank department, `ทุกภาควิชา / ส่วนกลาง`, or `สำนักงานคณะ` identifies a central Admin who receives every `role:admin` email. Department Admins receive emails for their matching department. Existing Super Admin email exemptions remain supported.

The database lookup still selects only `users.role = admin`. Recipient emails and department comparisons are trimmed and normalized, duplicate addresses are removed, and invalid email addresses are excluded. Events without department metadata retain the existing broadcast behavior.

Both single and batch notifications use the same recipient selection. This change adds no account-management permissions, database migrations, email copies of individual student/teacher events, or historical resends. SMTP delivery and inbox filtering remain separate from recipient selection.

Verification uses invented accounts and intercepted fetch calls against the actual NotificationProvider. No real notification, email, or Chat message is sent by these tests.

Validation: 100 tests and the Vite build pass. A read-only check using the same recipient lookup as the production client selected all three central Admins plus the one matching department Admin for each current department, with no unrelated department recipients.

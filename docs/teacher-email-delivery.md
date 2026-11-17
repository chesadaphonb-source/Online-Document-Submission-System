# Teacher notification email delivery

Email is initiated by the browser performing the workflow action. The receiving
teacher does not need to sign in or open the application. Signing in loads
in-app notifications; it does not send or retry email.

## Changes

- Single and batch notifications share one delivery path. Email runs independently
  of Google Chat, with separate request deadlines (20 seconds for email and
  5 seconds for Chat). Recipient lookup has a 10-second result deadline.
- Both channels check HTTP failures. Unresolved email recipients, email network
  errors, and non-success email responses produce one sender-facing warning per
  operation. Chat failures are logged without blocking email.
- A student's supplied email can only substitute for a missing guest-student
  account on that student's `/student/track` notification. It cannot substitute
  for a teacher or an Admin.
- Small requests use fetch keepalive when the shared outstanding body budget
  permits it; larger/busy batches use ordinary fetch.
- The email API checks SMTP accepted/rejected recipients and reports partial or
  failed acceptance instead of returning unconditional success. Correlation logs
  contain counts and event/submission identifiers rather than message content or
  recipient address lists.

Admin recipient selection, approver assignments, approval transitions, staging
delivery suppression, and notification database storage remain unchanged.

## Validation and limits

Regression tests run the actual provider and API handler with mocked database,
fetch, SMTP, and UI notifications. All addresses are synthetic. Tests do not send
email or access production data.

Final local validation: all 131 tests pass (including 20 delivery-provider and
11 SMTP-handler tests), and the production build passes with environment-file
loading disabled. Existing bundle-size and mixed-import build warnings remain.

There is no automatic retry: after a lost connection or partial SMTP acceptance,
resending the whole request could duplicate mail already accepted by the server.
SMTP acceptance is not evidence of inbox delivery. This patch does not add a
durable outbox, a background sender, historical resend, or per-recipient delivery
receipts. A browser closed before it starts a request can still lose that request.

The reported incident's specific cause requires a teacher/request identifier and
available sending logs. Reproduced failure paths alone do not prove which path
occurred in that incident.

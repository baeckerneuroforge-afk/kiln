# Departments Channels

Phase 2 connects Customer-Support Departments to Email and WhatsApp while keeping approval-first safety intact.

## Required Environment Variables

```bash
RESEND_API_KEY=re_...

WHATSAPP_VERIFY_TOKEN=<custom-string>
WHATSAPP_ACCESS_TOKEN=<meta-cloud-api-token>
META_APP_SECRET=<meta-app-secret>

DEPARTMENT_BLOCK_AUTO_SEND=true
DEPARTMENT_INBOUND_ALLOWLIST=test@example.com,491701234567
```

`DEPARTMENT_BLOCK_AUTO_SEND` defaults to blocked outside production unless it is explicitly set to `false`. In production, real sends require `DEPARTMENT_BLOCK_AUTO_SEND=false`.

`DEPARTMENT_INBOUND_ALLOWLIST` is optional. When set, only listed email addresses or phone numbers are processed. When empty, inbound messages from all senders are accepted.

## Resend Email Setup

1. Enable Email in the Department settings tab.
2. Configure the Department inbound/from addresses.
3. In Resend Inbound settings, point the inbound webhook to:

```text
https://kilnbase.com/api/webhooks/department-email/<departmentId>
```

Inbound email creates a `DepartmentChannelMessage`, links it to a backlog item, and wakes the manager loop.

## WhatsApp Setup

1. Enable WhatsApp in the Department settings tab.
2. Add the Meta Phone Number ID and Business Account ID.
3. In Meta webhooks, use:

```text
https://kilnbase.com/api/webhooks/department-whatsapp/<departmentId>
```

4. Set the verify token to the same value as `WHATSAPP_VERIFY_TOKEN`.

Inbound WhatsApp webhooks are verified with `META_APP_SECRET` via `x-hub-signature-256`.

## Approval-First Send Flow

1. Inbound channel message arrives.
2. KILN stores it as `DepartmentChannelMessage`.
3. KILN enqueues a `DepartmentBacklogItem`.
4. The manager loop drafts a reply with `REQUEST_APPROVAL`.
5. A human approves in the Department approval queue.
6. The channel sender runs.
7. If `DEPARTMENT_BLOCK_AUTO_SEND=true`, the send is blocked and logged.
8. If sending is enabled, Resend or Meta Graph API sends the message and KILN logs the external id.

WhatsApp free-form messages are only sent inside the 24-hour customer-service window. Outside that window, KILN blocks the outbound message with `Outside 24h window — template required`.

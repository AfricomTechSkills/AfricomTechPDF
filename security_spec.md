# Security Specification & Invariants — FolioForge

## Data Invariants
1. **Identity Isolation**: A user can only read/write their own `/users/{userId}` profile, their own `/usageLogs` (`userId == request.auth.uid`), and their own `/invoices` (`userId == request.auth.uid`), unless the caller is a verified administrator.
2. **No Self-Assigned Privileges**: During `/users/{userId}` creation, non-bootstrapped callers MUST set `role: 'user'`, `plan: 'free'`, `status: 'active'`, `dailyUsageCount: 0`, and `totalOperations: 0`.
3. **Immutable Ownership & Timestamps**: `uid`, `email`, `userId`, and `createdAt` can never be reassigned after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. **Terminal Invoice State**: Once an invoice transitions to `refunded` or `void`, it cannot revert to `paid`.
5. **Action-Scoped Updates**: Users cannot alter `role` or `status` via profile/usage/subscription update actions; only verified admins can mutate RBAC or platform settings.

## Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Self-Admin Escalation**: `POST /users/{uid}` with `role: "admin"` by non-admin user.
2. **Self-Pro Escalation on Signup**: `POST /users/{uid}` with `plan: "pro"` by non-admin user.
3. **Shadow Field Injection**: `PATCH /users/{uid}` injecting `isVerified: true` or `freeQuotaOverride: 999`.
4. **UID Spoofing**: `POST /usageLogs/{id}` with `userId: "victim_uid"`.
5. **Backdated Timestamp**: `POST /usageLogs/{id}` with client-supplied past `createdAt`.
6. **ID Poisoning**: `PUT /users/../../../../admin_123` or 1.5KB junk document ID.
7. **Unverified Email Spoof**: Request claiming admin email with `email_verified: false`.
8. **Cross-User PII Read**: `GET /users/{otherUid}` by non-owner non-admin user.
9. **Blanket Collection Scrape**: `LIST /invoices` without `userId == request.auth.uid` filter by non-admin.
10. **Usage Log Tampering**: `UPDATE /usageLogs/{id}` attempting to erase daily count.
11. **Platform Settings Hijack**: `UPDATE /settings/platform` setting `freeDailyLimit: 9999` by regular user.
12. **Invoice Forgery / Status Reset**: `UPDATE /invoices/{id}` setting `status: "paid"` on a `refunded` invoice by regular user.

# Newsletter Admin — Pre-Launch Admin Panel (Phase A)

> **Status**: Partial — backend subscriber infrastructure done · broadcast + composer pending.

## Goal

Provide a way to view subscribers and send pre-launch updates manually via Resend, with an admin page that matches the app's Exgen dark theme.

---

## ✅ What's done

| Item                                                                                | Status |
| ----------------------------------------------------------------------------------- | ------ |
| Prisma `Subscriber` model + migration                                               | ✅     |
| `GET /subscribers` (auth-protected, filters by status)                              | ✅     |
| `POST /subscribe` (double-opt-in with rate limiting)                                | ✅     |
| `POST /verify` (token-based email confirmation)                                     | ✅     |
| `POST /unsubscribe` (one-click from email link)                                     | ✅     |
| `sendNewsletterConfirmation` in `EmailService`                                      | ✅     |
| `SubscriberInfo` + `SubscribersResponse` types in SDK                               | ✅     |
| `getSubscribers()` in SDK                                                           | ✅     |
| `AdminNewsletterPage.tsx` — subscribers table with status filter (merged page + UI) | ✅     |
| Route `/admin/newsletter` in `App.tsx` under `ProtectedRoute`                       | ✅     |
| Privacy Policy §6 — "pre-launch updates for verified subscribers"                   | ✅     |

## Files to create

| File                                                   | Purpose                                                             | Status     |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ---------- |
| `apps/client/src/components/admin/ComposerToolbar.tsx` | Tiptap rich-text toolbar (bold, italic, heading, link, bullet list) | ⏳ Pending |

> Note: The subscribers table was implemented directly in `AdminNewsletterPage.tsx` (no separate `NewsletterAdmin.tsx` component needed). Compose + send UI still needs to be added to the same page or as a sibling.

## Files to modify

| File                                            | What changes                                                         | Status     |
| ----------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| `apps/server/src/routes/newsletter/index.ts`    | Add `POST /broadcast` (sends to all verified via Resend batch)       | ⏳ Pending |
| `apps/server/src/services/EmailService.ts`      | Add `sendBroadcastEmail(to, subject, html, unsubscribeUrl)` method   | ⏳ Pending |
| `generated/CDSDK/api/newsletter.ts`             | Add `broadcast(subject, html)`                                       | ⏳ Pending |
| `apps/client/src/pages/AdminNewsletterPage.tsx` | Add compose UI (subject input + Tiptap editor + send buttons)        | ⏳ Pending |
| `apps/client/package.json`                      | Add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link` | ⏳ Pending |

---

## How broadcast works (server)

```
POST /api/newsletter/broadcast { subject, html }
  → fetch all subscribers WHERE status = 'verified'
  → for each subscriber:
       generate token, store tokenHash
       call EmailService.sendBroadcastEmail(email, subject, html, unsubscribeUrl)
  → return { sent: count }
```

Each subscriber gets a unique unsubscribe link. The broadcast email uses the shared `NEWSLETTER_FOOTER` with their personal unsubscribe URL.

---

## Composer UI (Tiptap) ⏳ Pending

```
┌─────────────────────────────────┐
│  Subject: [__________________]  │
├─────────────────────────────────┤
│  [B] [I] [H2] [Link] [• List]  │ ← ComposerToolbar
├─────────────────────────────────┤
│                                 │
│  Tiptap editor (wysiwyg)        │
│                                 │
├─────────────────────────────────┤
│  [Send Test]   [Send to All]    │
└─────────────────────────────────┘
```

- Send Test → sends to your account email (from `useAuthStore`)
- Send to All → confirmation modal: _"This will send to {count} verified subscribers. Continue?"_

---

## Subscribers table ✅ (implemented)

Exgen dark theme matching the app. Implemented in `AdminNewsletterPage.tsx` with:

- Status filter: All / Verified / Pending / Unsubscribed (pill buttons)
- Columns: Email, Status (colored badge with dot), Subscribed date, Verified date
- Loading spinner, error state, and empty state
- No CSV export yet (pending)

---

## Design decisions (confirmed)

| Decision           | Choice                                                       | Status     |
| ------------------ | ------------------------------------------------------------ | ---------- |
| Admin page styling | Match app's Exgen dark theme                                 | ✅ Done    |
| Privacy Policy     | Update §6 to allow pre-launch updates                        | ✅ Done    |
| Subscribers table  | Built into `AdminNewsletterPage.tsx` (no separate component) | ✅ Done    |
| Compose experience | Rich-text editor (Tiptap)                                    | ⏳ Pending |
| Broadcast endpoint | `POST /broadcast` — batch-send to all verified               | ⏳ Pending |
| CSV export         | Download filtered list as CSV                                | ⏳ Pending |
| Test send target   | Email from `useAuthStore`                                    | ⏳ Pending |
| Admin route        | Accessible via URL (not nav-linked until decided)            | ✅ Done    |

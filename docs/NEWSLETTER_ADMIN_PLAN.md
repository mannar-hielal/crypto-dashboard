# Newsletter Admin — Pre-Launch Admin Panel (Phase A)

> **Status**: Planned · Not started until explicitly instructed.

## Goal

Provide a way to view subscribers and send pre-launch updates manually via Resend, with an admin page that matches the app's Exgen dark theme.

---

## Files to create

| File                                                   | Purpose                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `apps/client/src/components/admin/NewsletterAdmin.tsx` | Admin page — subscribers table + compose + send                     |
| `apps/client/src/components/admin/ComposerToolbar.tsx` | Tiptap rich-text toolbar (bold, italic, heading, link, bullet list) |
| `apps/client/src/pages/AdminNewsletterPage.tsx`        | Page wrapper with SeoHead + layout                                  |

## Files to modify

| File                                         | What changes                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/server/src/routes/newsletter/index.ts` | Add `GET /subscribers` (auth-protected, returns list) + `POST /broadcast` (sends to all verified via Resend batch) |
| `apps/server/src/services/EmailService.ts`   | Add `sendBroadcastEmail(to, subject, html, unsubscribeUrl)` method                                                 |
| `generated/CDSDK/api/newsletter.ts`          | Add `getSubscribers()` and `broadcast(subject, html)`                                                              |
| `apps/client/src/App.tsx`                    | Add `/admin/newsletter` route under `ProtectedRoute`                                                               |
| `apps/client/src/pages/PrivacyPage.tsx`      | Update §6 — "no marketing emails" → "pre-launch updates for verified subscribers"                                  |
| `apps/client/package.json`                   | Add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`                                               |

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

## Composer UI (Tiptap)

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

## Subscribers table

Exgen dark theme matching the app.

```
┌────────────────────────────────────────────────────────────┐
│  Subscribers (42)          [Export CSV]  [All ▼]           │
├────────────────────────────────────────────────────────────┤
│  email                        status     subscribed         │
│  user@gmail.com               ● Verified  27 Jun 2026       │
│  other@yahoo.com              ○ Pending   26 Jun 2026       │
│  ...                                                       │
└────────────────────────────────────────────────────────────┘
```

- Status filter: All / Verified / Pending / Unsubscribed
- CSV export: downloads filtered list as CSV

---

## Design decisions (confirmed)

| Decision           | Choice                                            |
| ------------------ | ------------------------------------------------- |
| Admin page styling | Match app's Exgen dark theme                      |
| Privacy Policy     | Update §6 to allow pre-launch updates             |
| Compose experience | Rich-text editor (Tiptap)                         |
| Test send target   | Email from `useAuthStore`                         |
| Admin route        | Accessible via URL (not nav-linked until decided) |

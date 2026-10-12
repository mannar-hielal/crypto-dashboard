# Privacy policy 1.3 — notice to registered users (draft, not sent)

> **Status:** drafted 2026-10-11 for the owner to send. **Nothing in the code sends this.** The owner chose
> (2026-10-11) to treat the 1.3 change as **material**, and privacy policy §13 says material changes are e-mailed
> to registered users. The release that carries 1.3 (activity days, learning events, learning progress, the
> opt-in order-fill e-mail) should not be merged to `main` until this has gone out, or the decision is reversed.

## What changed in 1.3 (October 11, 2026)

| Addition                     | What is recorded                                                                                                    | Kept                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Activity days                | one record per day you signed in or resumed your session: your account and the date — no time, IP address or device | 180 days, or until the account is deleted   |
| Learning events              | which guided-tour step you reached and when — nothing you typed; at most 500 per account                            | 180 days, or until the account is deleted   |
| Learning progress            | which tours you finished and whether you dismissed the welcome offer                                                | until the account is deleted                |
| Order-fill e-mail preference | **only if you turn it on:** a yes and the time you said yes (proof of consent)                                      | until you turn it off or delete the account |

Legal bases: legitimate interest (Art. 6(1)(f) GDPR) for counting, in aggregate, how often people return and where
they stop in the tours — you may object (policy §11); consent (Art. 6(1)(a)) for the optional order-fill e-mail.
No change to who receives your data: no new processor, nothing is sold or used for advertising.

## The e-mail (to send from the owner's mailbox or the existing provider)

**Subject:** An update to the cryptopapertrade.com privacy policy

> Hi,
>
> We have updated our privacy policy (version 1.3). Nothing about who sees your data has changed, and we still do
> not sell it or use it for advertising. Here is what is new:
>
> - **Activity days.** We now keep one record for each day you sign in: your account and the date, with no time,
>   IP address or device. We use it to count, in total, how many people come back. Deleted after 180 days or with
>   your account.
> - **Guided tours.** We now remember which tours you finished, and which step of a tour you reached, so we can see
>   where people get stuck. No text you type is recorded. Deleted with your account (step records after 180 days).
> - **Optional e-mail.** You can now choose to get one e-mail when a pending order of yours fills while you are
>   away. It is off unless you turn it on in Settings, and every such e-mail has a link that turns it off.
>
> You can read the full policy at https://cryptopapertrade.com/privacy. You can object to the counting above, or
> ask for your data or its deletion, by replying to this e-mail or writing to info@cryptopapertrade.com.
>
> The cryptopapertrade.com team

## Before sending

- Check the wording with the Swiss lawyer session already planned (this is drafted, not legal advice).
- Send only to verified, non-deleting accounts (`User.emailVerifiedAt` set, `deletionRequestedAt` null).
- There is no bulk sender for registered users in the app; the newsletter broadcast is for subscribers only.

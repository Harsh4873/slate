# Gmail → Slate Inbox sync

Creates a task in Slate's **Inbox** section whenever a sender you choose
emails you. Runs as a free Google Apps Script on a timer inside your own
Google account — no servers, no third parties.

## How it works

- Every few minutes the script searches Gmail for recent mail from the
  watched sender (including Spam, last 14 days).
- Each new message becomes one Firestore document in
  `slate_users/{uid}/tasks` with a deterministic id (`gmail-<messageId>`)
  and a **create-only** write, so nothing ever syncs twice — and checking
  off or deleting the task in Slate never resurrects it.
- The task title is the email subject, the notes hold a 400-character
  preview plus a deep link back to the message in Gmail, and (optionally)
  the task is due **today**, which also surfaces it in the Schedule tab's
  "Due today" panel.
- Slate picks the task up through its normal sync listeners — it appears
  on every signed-in device within seconds.

Authorization: the script calls the Firestore REST API with your own
Google OAuth token. Because your Google account **owns** the
`pickledgerpro` Firebase project, IAM grants the write — the app's
security rules stay locked down for everyone else.

## Setup (one time, ~5 minutes)

First fill in the two placeholders at the top of `Code.gs`:
`WATCH_SENDER` (the address whose mail should become tasks) and
`SLATE_UID` — your Firebase Auth UID, from Firebase Console →
Authentication → Users, for the Google account you sign into Slate with.

1. **Create / update the script.** Go to [script.google.com](https://script.google.com)
   **while signed in as the Google account that owns the Firebase project**
   → open the existing Slate sync project (or New project) → paste
   `Code.gs` over the default file.
   Then Project Settings → check *"Show appsscript.json manifest file"* →
   paste `appsscript.json` over it. Save.
2. **Authorize.** Select `syncWatchedSenderToSlate` in the toolbar and hit
   **Run** once; approve the Gmail + Google Cloud permissions it asks for.
3. **Confirm it worked.** View → Logs (or Executions). You want a line like
   `Slate sync: N created, …`. If threads=0, run `diagnoseGmailSync` and
   check that the watched sender's mail is actually in this Gmail account.
4. **Add the timer.** Left sidebar → Triggers → **Add trigger** →
   `syncWatchedSenderToSlate`, event source *Time-driven*, every
   **5 minutes** (or 10 — email cadence hardly needs less).

## When the sender writes to a different mailbox

If the sender writes to a mailbox other than the Gmail account that owns
the Firebase project, pick one:

- **Option A (recommended): forward the sender.** In that mailbox,
  Settings → *Forwarding and POP/IMAP* → add the project's Gmail address
  as a forwarding address (verify the code), then create a filter:
  `from:<watched sender>` → *Forward to* that address. Only their mail
  gets forwarded.
- **Option B: run the script in the other account instead.** If the
  organization blocks forwarding, create the Apps Script while signed in
  as that account, and grant it write access to the project:
  [console.cloud.google.com](https://console.cloud.google.com) → your
  project → IAM → **Grant access** → that principal, role
  **Cloud Datastore User**. (Workspace policy can also block Apps Script
  external requests; if it does, use Option A.)

## Tweaks

- Watch someone else / several people: change `WATCH_SENDER` (duplicate
  the search line for more senders).
- Don't want the tasks due today: set `ADD_DUE_TODAY = false`.
- Tasks land in the built-in **Inbox** section (`starter-inbox`). If you
  ever delete that section, either point `INBOX_SECTION_ID` at another
  section's id or the tasks will surface under "Recovered tasks".

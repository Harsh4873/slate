/**
 * Slate — Gmail → To-Do Inbox sync
 *
 * Watches Gmail for new mail from WATCH_SENDER and creates one task per
 * message in Slate's Inbox section (slate_users/{uid}/tasks in the
 * `pickledgerpro` Firebase project). Runs as a time-driven Apps Script
 * trigger in the Google account that owns the Firebase project.
 *
 * Idempotent by design: the task's document id is derived from the Gmail
 * message id and the write is create-only, so a message is never synced
 * twice — and completing or deleting the task in Slate never brings it back.
 *
 * Setup: run this in the Google account that owns the Firebase project.
 */

const WATCH_SENDER = 'PASTE_SENDER_ADDRESS';
const TITLE_PREFIX = ''; // optional prefix for the created task title
const FIREBASE_PROJECT_ID = 'pickledgerpro';
// Firebase Auth UID of the account you sign into Slate with (Authentication → Users).
const SLATE_UID = 'PASTE_YOUR_FIREBASE_AUTH_UID';
const INBOX_SECTION_ID = 'starter-inbox'; // Slate's built-in Inbox section
const SEARCH_WINDOW = 'newer_than:14d'; // how far back each run looks
const ADD_DUE_TODAY = true; // also surfaces the task in Schedule's "Due today" panel

function syncWatchedSenderToSlate() {
  assertConfigured_();

  // in:anywhere catches forwards that land in Spam; trash is still excluded.
  const query = 'in:anywhere from:' + WATCH_SENDER + ' ' + SEARCH_WINDOW + ' -in:trash';
  const threads = GmailApp.search(query, 0, 50);
  let created = 0;
  let alreadySynced = 0;
  let skipped = 0;

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      // Threads can contain your own replies; only sync the watched sender's.
      if (!isWatchedSender_(message)) {
        skipped += 1;
        Logger.log('Skip (from mismatch): %s | %s', message.getFrom(), message.getSubject());
        return;
      }
      const result = createTask_(message);
      if (result === 'created') created += 1;
      else alreadySynced += 1;
    });
  });

  Logger.log(
    'Slate sync: %s created, %s already synced, %s skipped, %s threads matched.',
    created,
    alreadySynced,
    skipped,
    threads.length
  );
}

/**
 * One-shot diagnostic. Run this from the Apps Script editor if sync looks empty.
 * Logs mailbox hits, From headers, and a dry Firestore create attempt outcome.
 */
function diagnoseGmailSync() {
  assertConfigured_();
  const query = 'from:' + WATCH_SENDER + ' ' + SEARCH_WINDOW;
  const threads = GmailApp.search(query, 0, 20);
  Logger.log('diagnose: query=%s threads=%s uid=%s', query, threads.length, SLATE_UID);

  let messageCount = 0;
  let matchCount = 0;
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      messageCount += 1;
      const from = message.getFrom();
      const matched = isWatchedSender_(message);
      if (matched) matchCount += 1;
      Logger.log(
        'diagnose msg: matched=%s from=%s subject=%s date=%s id=%s',
        matched,
        from,
        message.getSubject(),
        message.getDate(),
        message.getId()
      );
    });
  });

  Logger.log('diagnose: messages=%s matched=%s', messageCount, matchCount);

  // Prove Firestore IAM write works without creating a real task.
  const probeUrl = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID
    + '/databases/(default)/documents/slate_users/' + SLATE_UID;
  const probe = UrlFetchApp.fetch(probeUrl, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  Logger.log('diagnose: slate_users/%s GET → %s %s', SLATE_UID, probe.getResponseCode(), probe.getContentText().slice(0, 300));
}

function assertConfigured_() {
  if (!SLATE_UID || SLATE_UID.indexOf('PASTE_') === 0) {
    throw new Error('SLATE_UID is not set. Paste the Firebase Auth UID of the account you sign into Slate with (Firebase Console → Authentication → Users).');
  }
  if (!WATCH_SENDER || WATCH_SENDER.indexOf('PASTE_') === 0) {
    throw new Error('WATCH_SENDER is not set. Paste the email address whose messages should become tasks.');
  }
}

function isWatchedSender_(message) {
  const watched = WATCH_SENDER.toLowerCase();
  const from = extractAddress_(message.getFrom());
  if (from === watched) return true;

  // Auto-forwards sometimes keep the original address only in Reply-To.
  try {
    const replyTo = message.getReplyTo();
    if (replyTo && extractAddress_(replyTo) === watched) return true;
  } catch (e) {
    // getReplyTo is unavailable in some runtimes; ignore.
  }

  // Manual "Fwd:" from yourself: original From appears in the body header block.
  const subject = (message.getSubject() || '').toLowerCase();
  if (subject.indexOf('fwd:') === 0 || subject.indexOf('fw:') === 0) {
    const body = (message.getPlainBody() || '').slice(0, 2000).toLowerCase();
    if (body.indexOf('from: ' + watched) !== -1 || body.indexOf('<' + watched + '>') !== -1) {
      return true;
    }
  }

  return false;
}

function extractAddress_(fromHeader) {
  if (!fromHeader) return '';
  const match = String(fromHeader).match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

function createTask_(message) {
  const docId = 'gmail-' + message.getId();
  const nowIso = new Date().toISOString();
  const subject = message.getSubject() || '(no subject)';
  const preview = message.getPlainBody().replace(/\s+/g, ' ').trim().slice(0, 400);
  const link = 'https://mail.google.com/mail/u/0/#all/' + message.getId();

  const fields = {
    id: { stringValue: docId },
    sectionId: { stringValue: INBOX_SECTION_ID },
    title: { stringValue: TITLE_PREFIX + subject },
    notes: {
      stringValue: 'From: ' + message.getFrom()
        + '\nReceived: ' + message.getDate()
        + '\n\n' + preview
        + '\n\n' + link,
    },
    done: { booleanValue: false },
    order: { doubleValue: message.getDate().getTime() }, // chronological, below hand-added tasks
    createdAt: { stringValue: nowIso },
    updatedAt: { stringValue: nowIso },
  };
  if (ADD_DUE_TODAY) {
    fields.due = {
      stringValue: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    };
  }

  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID
    + '/databases/(default)/documents/slate_users/' + SLATE_UID
    + '/tasks?documentId=' + encodeURIComponent(docId);

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fields }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code === 200) return 'created';
  if (code === 409) return 'exists'; // already synced on an earlier run
  throw new Error('Firestore write failed (' + code + '): ' + response.getContentText());
}

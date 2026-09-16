// Netlify Scheduled Function — runs every 5 minutes
// Checks Firebase for due reminders and sends Web Push notifications
const webpush = require('web-push');
const https   = require('https');
const url     = require('url');

const VAPID_PUBLIC  = 'BP_l0vy2WLkFlu5nJ1sYTK4ueh9qTL8Kqzpe_vo3-gZWdI9-k2tiHVjwr6cIzxExKTyBLCiBG0_gbyQmx4Ci_d8';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = 'https://beautiful-gaufre-1cad98.netlify.app';
const FB = 'https://calendar-4b1de-default-rtdb.europe-west1.firebasedatabase.app';

if (!VAPID_PRIVATE) {
  console.error('VAPID_PRIVATE env var is not set — no pushes can be sent. Set it in Netlify > Site configuration > Environment variables.');
} else {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

function fbGet(path) {
  return new Promise((resolve, reject) => {
    const u = url.parse(FB + path + '.json');
    https.get({ hostname: u.hostname, path: u.path, port: 443 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

function fbDelete(path) {
  return new Promise((resolve) => {
    const u = url.parse(FB + path + '.json');
    const req = https.request({ hostname: u.hostname, path: u.path, port: 443, method: 'DELETE' }, res => {
      res.on('data', () => {}); res.on('end', resolve);
    }).on('error', () => resolve());
    req.end();
  });
}

const handler = async () => {
  if (!VAPID_PRIVATE) return { statusCode: 500, body: 'VAPID_PRIVATE not configured' };
  try {
    const now = Date.now();
    const [reminders, subscriptions] = await Promise.all([
      fbGet('/reminders'),
      fbGet('/subscriptions')
    ]);

    if (!reminders || !subscriptions) {
      return { statusCode: 200, body: 'No pending reminders' };
    }

    const subList = Object.values(subscriptions);
    let sent = 0;

    for (const [id, rem] of Object.entries(reminders)) {
      if (!rem || !rem.fireAt || rem.fireAt > now) continue;

      for (const sub of subList) {
        try {
          const subObj = typeof sub === 'string' ? JSON.parse(sub) : sub;
          await webpush.sendNotification(
            subObj,
            JSON.stringify({ title: rem.title, body: rem.body, tag: id })
          );
          sent++;
        } catch(e) {
          console.error('Push send failed:', e.statusCode || e.message);
        }
      }
      // Delete the sent reminder
      await fbDelete('/reminders/' + id);
    }

    return { statusCode: 200, body: `Sent ${sent} notification(s)` };
  } catch(e) {
    console.error('Handler error:', e);
    return { statusCode: 500, body: e.message };
  }
};

const { schedule } = require('@netlify/functions');
module.exports.handler = schedule('*/5 * * * *', handler);

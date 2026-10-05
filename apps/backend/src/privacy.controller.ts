import { Controller, Get, Header } from '@nestjs/common';

const pageStart = (title: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — 81st FTC Connect</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#18332f}h1,h2{line-height:1.2}a{color:#00695c}input,button{font:inherit;padding:10px;margin:5px 0;box-sizing:border-box}input{width:100%}button{background:#00695c;color:white;border:0;border-radius:6px;cursor:pointer}button:disabled{opacity:.5}section{margin:24px 0}#status{min-height:2em}</style></head><body>`;

@Controller()
export class PrivacyController {
  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  )
  privacy() {
    return `${pageStart('Privacy policy')}
<main><h1>81st FTC Connect privacy policy</h1><p>Effective 3 October 2026. Operated by Sakib Ahmed Shanto. Contact: <a href="mailto:sakibahmedshanto15@gmail.com">sakibahmedshanto15@gmail.com</a>.</p>
<section><h2>What the app uses</h2><p>We use the participant roster supplied by the 81st FTC organizers, including names, FTC IDs, section, cadre, BCS batch, education, university, contact number, email, blood group, home district, optional biography, quotation, and profile photos provided by organizers or chosen by members. Members may edit some of these fields and replace or remove their photo. We use a separate verified login number to send one-time codes and protect access. We also record account, verification, session, membership-request, and administrator-review information needed to operate the service.</p></section>
<section><h2>Who can see it</h2><p>Signed-in approved members and the separate administrator/test account can view member profiles in the private directory, including contact and blood-group fields. Membership requests are visible to administrators. We do not sell profiles or use them for advertising.</p></section>
<section><h2>Services and storage</h2><p>The backend runs on Render, the database is hosted by Neon, and private profile photos are stored with Cloudflare R2. Photo links expire after a short time and are issued only to signed-in users. SMS verification uses sms.bd, which receives the destination number and code for delivery. GitHub Actions runs scheduled database cleanup. Your phone stores a session token in its secure storage. Database backups are stored privately on the operator's Mac and are scheduled for removal after about 30 days. Service logs and backup copies may persist for a limited period after account deletion.</p></section>
<section><h2>How long we keep data</h2><p>Verification codes expire after five minutes, and sign-in sessions expire after 30 days unless revoked earlier. Expired codes, rate-limit records, and expired or revoked sessions are normally removed on the next daily cleanup. Invitations are removed about 30 days after expiry, use, or revocation. Unreviewed membership requests are removed after about 90 days; reviewed requests are removed about 90 days after the decision. An active member's app profile remains until that member deletes it. Scheduled jobs can occasionally be delayed.</p></section>
<section><h2>Your choices</h2><p>You can edit supported profile fields and replace or remove your photo in the app. You can permanently delete your sign-in account and app directory profile from My profile → Delete my account. You can also use the <a href="/account-deletion">web deletion page</a> after uninstalling. Deletion removes the app account, directory profile, and stored app photo; backup copies expire on their normal rotation. The original roster supplied by the organizers is a separate source document and is not changed by app deletion. For access questions, corrections, or deletion help, email <a href="mailto:sakibahmedshanto15@gmail.com">sakibahmedshanto15@gmail.com</a>.</p></section>
<section><h2>Changes</h2><p>We may update this policy as the service changes. The current version will be available here.</p></section></main></body></html>`;
  }

  @Get('account-deletion')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
  )
  deletionPage() {
    return `${pageStart('Delete account')}
<main><h1>Delete your 81st FTC Connect account</h1>
<p>This permanently removes your sign-in account and profile from the app directory and signs out every device. It cannot be undone. Existing backup copies are scheduled for removal after about 30 days. The organizers' original roster document is separate.</p>
<p>If you still have your login number, verify it below. Your verification code stays in this browser session only.</p>
<section><label for="phone">Login phone number</label><input id="phone" type="tel" autocomplete="tel" inputmode="tel"><button id="send">Send verification code</button></section>
<section id="verify-section" hidden><label for="code">Six-digit code</label><input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"><button id="verify">Verify number</button></section>
<section id="delete-section" hidden><label for="confirmation">Type DELETE to confirm</label><input id="confirmation" type="text" autocomplete="off"><button id="delete" disabled>Delete account permanently</button></section>
<p id="status" role="status" aria-live="polite"></p>
<p>If you cannot sign in, email <a href="mailto:sakibahmedshanto15@gmail.com?subject=81st%20FTC%20Connect%20account%20deletion">sakibahmedshanto15@gmail.com</a> to request deletion. Include your FTC ID and a way to contact you; we will verify ownership before acting. Do not email an OTP.</p>
<p><a href="/privacy">Read the privacy policy</a></p></main><script src="/account-deletion.js" defer></script></body></html>`;
  }

  @Get('account-deletion.js')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', "default-src 'none'")
  deletionScript() {
    return `const byId = (id) => document.getElementById(id);
let challengeId = null;
let token = null;
const status = (message) => { byId('status').textContent = message; };
async function post(path, body) {
  const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Request failed. Please retry.');
  return data;
}
byId('send').addEventListener('click', async () => {
  byId('send').disabled = true;
  status('Requesting code…');
  try {
    const data = await post('/auth/login', {phone:byId('phone').value.trim()});
    challengeId = data.challengeId;
    byId('verify-section').hidden = false;
    status('If this number is eligible, enter the SMS code. It expires after five minutes.');
  } catch (error) { status(error.message); }
  finally { byId('send').disabled = false; }
});
byId('verify').addEventListener('click', async () => {
  byId('verify').disabled = true;
  status('Verifying…');
  try {
    const data = await post('/auth/verify', {challengeId, code:byId('code').value.trim()});
    token = data.token;
    byId('delete-section').hidden = false;
    status('Phone verified. Type DELETE only if you want permanent removal.');
  } catch (error) { status(error.message); }
  finally { byId('verify').disabled = false; }
});
byId('confirmation').addEventListener('input', () => { byId('delete').disabled = byId('confirmation').value.trim() !== 'DELETE'; });
byId('delete').addEventListener('click', async () => {
  if (!token || byId('confirmation').value.trim() !== 'DELETE') return;
  byId('delete').disabled = true;
  status('Deleting account…');
  try {
    const response = await fetch('/me', {method:'DELETE', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({confirm:'DELETE'})});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Deletion failed. Please retry.');
    token = null;
    byId('send').disabled = true;
    byId('verify-section').hidden = true;
    byId('delete-section').hidden = true;
    status('Your account and app profile have been deleted.');
  } catch (error) { status(error.message); byId('delete').disabled = false; }
});`;
  }
}

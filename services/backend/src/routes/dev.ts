import { Hono } from 'hono';
import { config } from '../config.js';

export const devRoutes = new Hono();

const TEST_STUDENTS = [
  'TP000001',
  'TP000002',
  'TP000003',
  'TP000004',
  'TP000005',
  'TP000006',
  'TP000007',
];

devRoutes.get('/launch', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dev Launcher (Simulated Uni App)</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #333; }
    .note { background: #fff8dc; padding: 12px; border-left: 4px solid #ffd700; margin: 20px 0; }
    .student { display: flex; justify-content: space-between; align-items: center; padding: 12px; margin: 8px 0; background: #f5f5f5; border-radius: 6px; }
    .id { font-family: monospace; }
    button { background: #0066cc; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0055aa; }
    input { padding: 8px; font-family: monospace; flex: 1; margin-right: 8px; border: 1px solid #ccc; border-radius: 4px; }
    .out { margin-top: 20px; padding: 12px; background: #f0f0f0; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 12px; }
    .out.error { background: #fee; }
    .out pre { margin: 0; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>🍱 Cafeteria Dev Launcher</h1>
  <div class="note">
    <strong>Dev only.</strong> Simulates the university app launching the cafeteria portal.
    Click a student to call <code>/auth/session</code> with the shared secret. You'll get a session token.
  </div>

  <h3>Pick a student to launch as:</h3>
  <div>
    ${TEST_STUDENTS.map(
      (s) => `
      <div class="student">
        <div class="id">${s}</div>
        <button onclick="launch('${s}')">Launch as this student</button>
      </div>`
    ).join('')}
  </div>

  <h3>Custom student ID:</h3>
  <div class="student">
    <input id="custom" type="text" placeholder="TP000999">
    <button onclick="launchCustom()">Launch</button>
  </div>

  <div id="output"></div>

  <script>
    async function launch(studentID) {
      const out = document.getElementById('output');
      out.innerHTML = '<div class="out">Calling /auth/session...</div>';

      try {
        const res = await fetch('/auth/session?studentID=' + encodeURIComponent(studentID), {
          headers: { 'X-App-Secret': ${JSON.stringify(config.appSecret)} }
        });
        const data = await res.json();

        if (!res.ok) {
          out.innerHTML = '<div class="out error"><pre>' + JSON.stringify(data, null, 2) + '</pre></div>';
          return;
        }

        out.innerHTML =
          '<div class="out"><strong>Session created!</strong><pre>' +
          JSON.stringify(data, null, 2) +
          '</pre><br><strong>Use the session token in your next requests:</strong><br>' +
          '<code>Authorization: Bearer ' + data.token + '</code></div>';
      } catch (err) {
        out.innerHTML = '<div class="out error">' + err.message + '</div>';
      }
    }

    function launchCustom() {
      const id = document.getElementById('custom').value.trim();
      if (!id) return;
      launch(id);
    }
  </script>
</body>
</html>`;
  return c.html(html);
});
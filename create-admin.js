'use strict';
// Gumawa (o i-promote) ng Admin account sa database.
// Gamit:  node create-admin.js "Full Name" email@example.com ADMIN-ID password
const bcrypt = require('bcryptjs');
const { pool, query, initSchema } = require('./server.js');

(async () => {
  const [fullname, email, id, password] = process.argv.slice(2);
  if (!fullname || !email || !id || !password) {
    console.error('Gamit: node create-admin.js "Full Name" email@example.com ADMIN-ID password');
    process.exit(1);
  }
  if (password.length < 6) { console.error('Dapat 6+ characters ang password.'); process.exit(1); }
  await initSchema();
  const hash = await bcrypt.hash(password, 10);
  const rows = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) {
    await query("UPDATE users SET role = 'Admin', status = 'approved', password = ? WHERE id = ?", [hash, rows[0].id]);
    console.log('Na-promote bilang Admin ang existing account:', email);
  } else {
    await query("INSERT INTO users (fullname, email, student_id, password, role, status) VALUES (?, ?, ?, ?, 'Admin', 'approved')",
      [fullname, email, id, hash]);
    console.log('Nagawa ang Admin account:', email);
  }
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });

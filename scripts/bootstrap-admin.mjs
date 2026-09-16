import { createInterface } from 'node:readline/promises';
import { StringDecoder } from 'node:string_decoder';
import { createApi } from '../server/api.mjs';
import { createDatabase } from '../server/db.mjs';

class SetupError extends Error {}

function maskedQuestion(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    const previousRawMode = input.isRaw;
    const decoder = new StringDecoder('utf8');
    let value = '';
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      input.off('data', onData);
      input.off('end', onEnd);
      input.setRawMode(previousRawMode);
      input.pause();
      output.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onEnd = () => finish(new SetupError('Setup canceled.'));
    const onData = (chunk) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u0003' || character === '\u0004') { finish(new SetupError('Setup canceled.')); return; }
        if (character === '\u007f' || character === '\b') {
          if (value) { value = Array.from(value).slice(0, -1).join(''); output.write('\b \b'); }
        } else if (character.charCodeAt(0) >= 32 && value.length + character.length <= 128) {
          value += character;
          output.write('*');
        }
      }
    };
    output.write(prompt);
    input.setRawMode(true);
    input.on('data', onData);
    input.once('end', onEnd);
    input.resume();
  });
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.NETLIFY_DB_URL) throw new SetupError('Set NETLIFY_DB_URL to the native Netlify production database, or DATABASE_URL for another PostgreSQL provider, then run setup again.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new SetupError('Owner setup requires an interactive terminal so the password can be masked.');
  console.log('Crops owner setup\nThis creates the first owner in the database configured by your private connection environment.');
  let db;
  try {
    try { db = await createDatabase(); }
    catch (error) { throw new SetupError(error.code === 'schema_uninitialized' ? error.message : 'Could not connect to PostgreSQL. Verify your private connection environment and database availability.'); }
    if ((await db.query('SELECT id FROM users LIMIT 1')).rows.length) throw new SetupError('This database already has an account. Owner setup only runs on an empty Crops database.');
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    let username, name, teamName;
    try {
      username = (await terminal.question('Owner username: ')).trim();
      name = (await terminal.question('Your name: ')).trim();
      teamName = (await terminal.question('Team name: ')).trim();
    } finally { terminal.close(); }
    const password = await maskedQuestion('Password (8–128 characters): ');
    const confirmation = await maskedQuestion('Confirm password: ');
    if (password !== confirmation) throw new SetupError('Passwords did not match. No account was created.');
    const api = createApi({ db, env: { ...process.env, CROPS_ALLOW_REGISTRATION: 'false' }, bootstrapOnly: true });
    const response = await api(new Request('https://setup.crops.invalid/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, teamName, password }),
    }), { ip: 'local-owner-setup' });
    const result = await response.json();
    if (!response.ok) throw new SetupError(result.error || 'Owner setup did not complete.');
    // bootstrapOnly creates no session or token; the owner signs in normally later.
    console.log(`\nOwner ${result.user.username} created successfully. Keep CROPS_ALLOW_REGISTRATION=false on Netlify and sign in with your new account.`);
  } finally { if (db) await db.close(); }
}

main().catch((error) => {
  console.error(error instanceof SetupError ? error.message : 'Owner setup failed. Check database availability and try again.');
  process.exitCode = 1;
});

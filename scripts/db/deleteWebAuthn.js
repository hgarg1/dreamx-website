const Database = require('better-sqlite3');
const path = require('path');

// Path to database in data directory
const dbPath = path.join(__dirname, '..', '..', 'data', 'dreamx.db');

// Open the database
const db = new Database(dbPath);

try {
  console.log('Connected to the SQLite database.');
  
  // SQL query to delete all WebAuthn credentials
  const result = db.prepare('DELETE FROM webauthn_credentials').run();
  
  console.log(`✅ All ${result.changes} WebAuthn credentials have been deleted.`);
} catch (err) {
  console.error('❌ Error executing query:', err.message);
} finally {
  db.close();
  console.log('Database connection closed.');
}

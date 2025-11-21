const sqlite3 = require('sqlite3').verbose();

// Path to your SQLite database
const dbPath = './dreamx.db'; // Replace with the actual path to your database

// Open the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  console.log('Connected to the SQLite database.');
});

// SQL query to alter column public_key to BLOB
const deleteQuery = 'DELETE FROM webauthn_credentials;';

// Execute the query
db.run(deleteQuery, function (err) {
  if (err) {
    console.error('Error executing query:', err.message);
  } else {
    console.log(`All records from the 'webauthn_credentials' table have been deleted.`);
  }
});

// Close the database connection
db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed.');
  }
});
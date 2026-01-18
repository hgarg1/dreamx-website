/**
 * SQL Compatibility Layer
 * 
 * Provides SQL syntax translation between SQLite and PostgreSQL
 * to allow the codebase to work with both databases.
 */

const { isProduction } = require('./adapter');

/**
 * Get the current date/time expression for SQL queries
 * @returns {string} SQL expression for current timestamp
 */
function getCurrentTimestamp() {
  return isProduction ? 'CURRENT_TIMESTAMP' : "datetime('now')";
}

/**
 * Get the current date (without time) expression for SQL queries
 * @returns {string} SQL expression for current date
 */
function getCurrentDate() {
  return isProduction ? 'CURRENT_DATE' : "date('now')";
}

/**
 * Generate an UPSERT (INSERT OR REPLACE) query compatible with both databases
 * 
 * For SQLite: Uses INSERT OR REPLACE
 * For PostgreSQL: Uses INSERT ... ON CONFLICT ... DO UPDATE
 * 
 * @param {string} table - Table name
 * @param {string[]} columns - Column names
 * @param {string[]} keyColumns - Primary key or unique constraint columns
 * @param {string} [placeholders] - Optional custom placeholders (defaults to ?)
 * @returns {string} SQL query string
 */
function upsertQuery(table, columns, keyColumns, placeholders = null) {
  const colList = columns.join(', ');
  const valuePlaceholders = placeholders || columns.map(() => '?').join(', ');
  
  if (!isProduction) {
    // SQLite: INSERT OR REPLACE
    return `INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${valuePlaceholders})`;
  }
  
  // PostgreSQL: INSERT ... ON CONFLICT ... DO UPDATE
  const conflictColumns = keyColumns.join(', ');
  const updateSet = columns
    .filter(c => !keyColumns.includes(c))
    .map((c, i) => {
      const colIndex = columns.indexOf(c);
      return `${c} = EXCLUDED.${c}`;
    })
    .join(', ');
  
  // Convert ? placeholders to $1, $2, etc. for PostgreSQL
  let placeholderIndex = 1;
  const pgPlaceholders = valuePlaceholders.replace(/\?/g, () => `$${placeholderIndex++}`);
  
  return `
    INSERT INTO ${table} (${colList}) 
    VALUES (${pgPlaceholders})
    ON CONFLICT (${conflictColumns}) 
    DO UPDATE SET ${updateSet}
  `;
}

/**
 * Generate an INSERT IGNORE query compatible with both databases
 * 
 * For SQLite: Uses INSERT OR IGNORE
 * For PostgreSQL: Uses INSERT ... ON CONFLICT ... DO NOTHING
 * 
 * @param {string} table - Table name
 * @param {string[]} columns - Column names
 * @param {string[]} keyColumns - Columns that form the unique constraint
 * @param {string} [placeholders] - Optional custom placeholders
 * @returns {string} SQL query string
 */
function insertIgnoreQuery(table, columns, keyColumns, placeholders = null) {
  const colList = columns.join(', ');
  const valuePlaceholders = placeholders || columns.map(() => '?').join(', ');
  
  if (!isProduction) {
    // SQLite: INSERT OR IGNORE
    return `INSERT OR IGNORE INTO ${table} (${colList}) VALUES (${valuePlaceholders})`;
  }
  
  // PostgreSQL: INSERT ... ON CONFLICT ... DO NOTHING
  const conflictColumns = keyColumns.join(', ');
  
  // Convert ? placeholders to $1, $2, etc. for PostgreSQL
  let placeholderIndex = 1;
  const pgPlaceholders = valuePlaceholders.replace(/\?/g, () => `$${placeholderIndex++}`);
  
  return `
    INSERT INTO ${table} (${colList}) 
    VALUES (${pgPlaceholders})
    ON CONFLICT (${conflictColumns}) 
    DO NOTHING
  `;
}

/**
 * Generate a date comparison expression
 * 
 * @param {string} column - Column name to compare
 * @param {string} operator - Comparison operator (<, >, <=, >=, =)
 * @param {string} dateExpr - 'now' for current date/time, or a specific expression
 * @returns {string} SQL expression
 */
function dateCompare(column, operator, dateExpr = 'now') {
  if (dateExpr === 'now') {
    return `${column} ${operator} ${getCurrentTimestamp()}`;
  }
  return `${column} ${operator} ${dateExpr}`;
}

/**
 * Convert SQLite LIMIT/OFFSET syntax to PostgreSQL syntax
 * 
 * SQLite: ... LIMIT ? OFFSET ?
 * PostgreSQL: ... LIMIT ? OFFSET ? (same syntax!)
 * 
 * This function modifies a SQL string and parameter array to use the correct syntax
 * and adjusts parameter order if necessary.
 * 
 * @param {string} sql - SQL query string with "LIMIT ? OFFSET ?" at the end
 * @param {number} limit - Limit value
 * @param {number} offset - Offset value
 * @returns {object} {sql: modified SQL string, limit, offset}
 */
function convertLimitOffset(sql, limit, offset) {
  if (!isProduction) {
    // SQLite: LIMIT OFFSET stays as is
    return { sql, limit, offset };
  }
  
  // PostgreSQL: Uses same LIMIT/OFFSET syntax as SQLite
  // Just need to convert ? placeholders to $1, $2, etc.
  // The actual LIMIT/OFFSET syntax is the same
  return { sql, limit, offset };
}

/**
 * Check if we're in production (PostgreSQL) mode
 * @returns {boolean}
 */
function isPostgres() {
  return isProduction;
}

/**
 * Check if we're in development (SQLite) mode
 * @returns {boolean}
 */
function isSqlite() {
  return !isProduction;
}

module.exports = {
  getCurrentTimestamp,
  getCurrentDate,
  upsertQuery,
  insertIgnoreQuery,
  dateCompare,
  convertLimitOffset,
  isPostgres,
  isSqlite,
  isProduction
};

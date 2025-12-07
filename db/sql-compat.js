/**
 * SQL Compatibility Layer
 * 
 * Provides SQL syntax translation between SQLite and SQL Server
 * to allow the codebase to work with both databases.
 */

const { isProduction } = require('./adapter');

/**
 * Get the current date/time expression for SQL queries
 * @returns {string} SQL expression for current timestamp
 */
function getCurrentTimestamp() {
  return isProduction ? 'GETDATE()' : "datetime('now')";
}

/**
 * Get the current date (without time) expression for SQL queries
 * @returns {string} SQL expression for current date
 */
function getCurrentDate() {
  return isProduction ? 'CAST(GETDATE() AS DATE)' : "date('now')";
}

/**
 * Generate an UPSERT (INSERT OR REPLACE) query compatible with both databases
 * 
 * For SQLite: Uses INSERT OR REPLACE
 * For SQL Server: Uses MERGE statement
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
  
  // SQL Server: MERGE statement
  const keyMatch = keyColumns.map(k => `target.${k} = source.${k}`).join(' AND ');
  const updateSet = columns
    .filter(c => !keyColumns.includes(c))
    .map(c => `target.${c} = source.${c}`)
    .join(', ');
  const sourceColumns = columns.map((c, i) => {
    // For parameterized queries, use @p0, @p1, etc.
    return `@p${i} AS ${c}`;
  }).join(', ');
  
  return `
    MERGE INTO ${table} AS target
    USING (SELECT ${sourceColumns}) AS source
    ON ${keyMatch}
    WHEN MATCHED THEN
      UPDATE SET ${updateSet}
    WHEN NOT MATCHED THEN
      INSERT (${colList}) VALUES (${columns.map(c => `source.${c}`).join(', ')});
  `;
}

/**
 * Generate an INSERT IGNORE query compatible with both databases
 * 
 * For SQLite: Uses INSERT OR IGNORE
 * For SQL Server: Uses INSERT with WHERE NOT EXISTS
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
  
  // SQL Server: INSERT with WHERE NOT EXISTS
  // For parameterized queries, we need to reference parameters
  const keyConditions = keyColumns.map((k, i) => {
    const colIndex = columns.indexOf(k);
    return `${k} = @p${colIndex}`;
  }).join(' AND ');
  
  return `
    INSERT INTO ${table} (${colList})
    SELECT ${columns.map((c, i) => `@p${i}`).join(', ')}
    WHERE NOT EXISTS (
      SELECT 1 FROM ${table} WHERE ${keyConditions}
    )
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
 * Convert SQLite LIMIT/OFFSET syntax to SQL Server syntax
 * 
 * SQLite: ... LIMIT ? OFFSET ?
 * SQL Server: ... OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
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
  
  // SQL Server: Convert to OFFSET...FETCH syntax
  // Replace "LIMIT ? OFFSET ?" with "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
  const converted = sql.replace(
    /LIMIT\s+\?\s+OFFSET\s+\?/i,
    'OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'
  );
  
  // For SQL Server, parameters must be: OFFSET value, FETCH NEXT value
  // But the original code had them as: LIMIT value, OFFSET value
  // So we need to swap them: return {offset, limit}
  return { sql: converted, limit: offset, offset: limit };
}

/**
 * Check if we're in production (SQL Server) mode
 * @returns {boolean}
 */
function isSqlServer() {
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
  isSqlServer,
  isSqlite,
  isProduction
};

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

/**
 * Convert SQL Server conditional logic to PostgreSQL-compatible syntax
 * 
 * SQL Server uses IF NOT EXISTS (SELECT ...) BEGIN ... END blocks,
 * but PostgreSQL only supports IF NOT EXISTS for CREATE statements directly.
 * This function converts SQL Server conditional blocks to PostgreSQL syntax.
 * 
 * @param {string} sql - SQL query string
 * @returns {string} SQL query with conditional logic converted
 */
function convertConditionalLogic(sql) {
  if (!isProduction) {
    // No conversion needed for SQLite
    return sql;
  }
  
  let convertedSql = sql;
  
  // Pattern 1: IF NOT EXISTS (SELECT ...) BEGIN ... END
  // Convert to just the CREATE statement with IF NOT EXISTS
  const ifNotExistsPattern = /IF\s+NOT\s+EXISTS\s*\([^)]*SELECT[^)]*\)\s*BEGIN\s*([\s\S]*?)\s*END/gi;
  convertedSql = convertedSql.replace(ifNotExistsPattern, (match, content) => {
    const trimmed = content.trim();
    // If it's a CREATE TABLE, add IF NOT EXISTS
    if (/CREATE\s+TABLE\s+/i.test(trimmed)) {
      return trimmed.replace(/CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
    }
    // If it's a CREATE INDEX, add IF NOT EXISTS
    if (/CREATE\s+(UNIQUE\s+)?INDEX\s+/i.test(trimmed)) {
      return trimmed.replace(/CREATE\s+((UNIQUE\s+)?INDEX\s+)/i, 'CREATE $1INDEX IF NOT EXISTS ');
    }
    // For other CREATE statements, try to add IF NOT EXISTS
    if (/CREATE\s+/i.test(trimmed)) {
      return trimmed.replace(/CREATE\s+([A-Z]+\s+)/i, 'CREATE $1IF NOT EXISTS ');
    }
    // For other statements, just return the content (remove the IF wrapper)
    return trimmed;
  });
  
  // Pattern 2: IF EXISTS (SELECT ...) BEGIN ... END
  // Convert DROP statements to DROP IF EXISTS
  const ifExistsPattern = /IF\s+EXISTS\s*\([^)]*SELECT[^)]*\)\s*BEGIN\s*([\s\S]*?)\s*END/gi;
  convertedSql = convertedSql.replace(ifExistsPattern, (match, content) => {
    const trimmed = content.trim();
    // If it's a DROP TABLE, add IF EXISTS
    if (/DROP\s+TABLE\s+/i.test(trimmed)) {
      return trimmed.replace(/DROP\s+TABLE\s+/i, 'DROP TABLE IF EXISTS ');
    }
    // If it's a DROP INDEX, add IF EXISTS
    if (/DROP\s+INDEX\s+/i.test(trimmed)) {
      return trimmed.replace(/DROP\s+INDEX\s+/i, 'DROP INDEX IF EXISTS ');
    }
    // For other DROP statements, try to add IF EXISTS
    if (/DROP\s+/i.test(trimmed)) {
      return trimmed.replace(/DROP\s+([A-Z]+\s+)/i, 'DROP $1IF EXISTS ');
    }
    // For other statements, just return the content
    return trimmed;
  });
  
  // Pattern 3: IF OBJECT_ID(...) IS NOT NULL DROP TABLE ...
  // Convert to DROP TABLE IF EXISTS
  convertedSql = convertedSql.replace(/IF\s+OBJECT_ID\s*\([^)]+\)\s+IS\s+NOT\s+NULL\s+DROP\s+TABLE\s+([^\s;]+)/gi, 
    'DROP TABLE IF EXISTS $1');
  
  // Pattern 4: Standalone IF statements (without EXISTS)
  // Remove the conditional wrapper and just execute the content
  const ifPattern = /IF\s+[^(]+\s+BEGIN\s*([\s\S]*?)\s*END/gi;
  convertedSql = convertedSql.replace(ifPattern, (match, content) => {
    // Just extract the content, removing the conditional wrapper
    return content.trim();
  });
  
  return convertedSql;
}

/**
 * Convert SQL query to handle boolean comparisons for PostgreSQL
 * 
 * SQLite stores booleans as integers (0/1), but PostgreSQL uses actual boolean types.
 * This function converts integer comparisons to boolean comparisons for known boolean columns.
 * 
 * @param {string} sql - SQL query string
 * @returns {string} SQL query with boolean comparisons converted
 */
function convertBooleanComparisons(sql) {
  if (!isProduction) {
    // No conversion needed for SQLite
    return sql;
  }
  
  // List of known boolean columns that need conversion
  const booleanColumns = [
    'verified', 'email_verified', 'phone_verified',
    'read', 'is_hidden', 'is_deleted', 'is_reel', 'is_group', 'is_frozen',
    'is_active', 'is_enabled', 'is_system_role', 'resolved', 'auto_renew', 
    'is_default', 'onboarding_completed', 'discoverable_by_email', 'used', 
    'revoked', 'is_pinned', 'is_public', 'email_notifications', 
    'push_notifications', 'message_notifications', 'show_online_status', 
    'read_receipts', 'chat_privileges_frozen', 'seller_privileges_frozen', 
    'first_goal_public', 'notify_followers', 'block_functionality_locked', 
    'recording_enabled', 'is_visible', 'is_archived', 'is_completed', 
    'is_cancelled', 'is_published', 'needs_onboarding'
  ];
  
  let convertedSql = sql;
  
  // Convert each boolean column comparison
  for (const column of booleanColumns) {
    // Pattern: column = 0 or column = 1 (with word boundaries to avoid partial matches)
    // Also handle table aliases like r.is_enabled, p.is_enabled, etc.
    // Use lookahead to ensure we're matching the full comparison, not part of a number
    const patterns = [
      // Table alias or direct: alias.column = 0 or column = 0
      // = 0 → = false (but not = 10, = 20, etc.)
      new RegExp(`(?:\\w+\\.)?${column}\\s*=\\s*0(?!\\d)`, 'gi'),
      // = 1 → = true (but not = 10, = 11, etc.)
      new RegExp(`(?:\\w+\\.)?${column}\\s*=\\s*1(?!\\d)`, 'gi'),
      // != 0 → = true
      new RegExp(`(?:\\w+\\.)?${column}\\s*!=\\s*0(?!\\d)`, 'gi'),
      // != 1 → = false
      new RegExp(`(?:\\w+\\.)?${column}\\s*!=\\s*1(?!\\d)`, 'gi'),
      // <> 0 → = true
      new RegExp(`(?:\\w+\\.)?${column}\\s*<>\\s*0(?!\\d)`, 'gi'),
      // <> 1 → = false
      new RegExp(`(?:\\w+\\.)?${column}\\s*<>\\s*1(?!\\d)`, 'gi')
    ];
    
    // For replacements, we need to preserve the table alias if present
    // We'll use a function to handle this
    for (let i = 0; i < patterns.length; i++) {
      convertedSql = convertedSql.replace(patterns[i], (match) => {
        // Extract table alias if present (e.g., "r.is_enabled = 1" or "is_enabled = 1")
        const parts = match.match(/^(\w+\.)?(\w+)\s*([=!<>]+)\s*([01])/i);
        if (parts) {
          const alias = parts[1] || ''; // e.g., "r." or ""
          const col = parts[2]; // e.g., "is_enabled"
          const operator = parts[3]; // e.g., "=", "!=", "<>"
          const value = parts[4] === '0' ? 'false' : 'true';
          // For != and <>, convert to = with opposite boolean
          if (operator === '!=' || operator === '<>') {
            return `${alias}${col} = ${value === 'false' ? 'true' : 'false'}`;
          }
          return `${alias}${col} = ${value}`;
        }
        return match;
      });
    }
  }
  
  return convertedSql;
}

module.exports = {
  getCurrentTimestamp,
  getCurrentDate,
  upsertQuery,
  insertIgnoreQuery,
  dateCompare,
  convertLimitOffset,
  convertConditionalLogic,
  convertBooleanComparisons,
  isPostgres,
  isSqlite,
  isProduction
};

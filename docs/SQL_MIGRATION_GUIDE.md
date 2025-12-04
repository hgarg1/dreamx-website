# MS SQL Server Migration Guide

## Overview
This document provides the MS SQL Server migration scripts for the new project comments and reactions feature.

## Prerequisites
- SQL Server Management Studio (SSMS) or `sqlcmd` utility
- Database admin access
- Database connection string

## Migration Files

### Primary Migration Script
**File**: `migrations/mssql-project-comments-schema.sql`

This script:
1. Creates `project_comment_files` table if it doesn't exist
2. Creates `project_comment_reactions` table if it doesn't exist
3. Includes all necessary indexes
4. Checks for existing tables to prevent errors

## How to Run

### Option 1: Using SQL Server Management Studio (SSMS)
1. Open SSMS
2. Connect to your database
3. File → Open → Select `migrations/mssql-project-comments-schema.sql`
4. Click "Execute" (F5)
5. Check Messages tab for confirmation

### Option 2: Using sqlcmd (Command Line)
```bash
sqlcmd -S <SERVER_NAME> -d <DATABASE_NAME> -U <USERNAME> -P <PASSWORD> -i migrations\mssql-project-comments-schema.sql
```

Replace:
- `<SERVER_NAME>` - Your SQL Server name (e.g., `localhost\SQLEXPRESS`)
- `<DATABASE_NAME>` - Your database name (e.g., `dreamx`)
- `<USERNAME>` - SQL Server login username
- `<PASSWORD>` - SQL Server login password

### Option 3: Using Azure Data Studio
1. Open Azure Data Studio
2. Connect to your SQL Server instance
3. File → Open File → Select `migrations/mssql-project-comments-schema.sql`
4. Right-click and select "Run"
5. Check Results tab for confirmation

## Verification

After running the migration, verify the tables were created:

```sql
-- Check if tables exist
SELECT * FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('project_comment_files', 'project_comment_reactions')
ORDER BY TABLE_NAME;

-- Expected output: 2 rows
```

Check table structure:

```sql
-- View project_comment_files columns
EXEC sp_columns 'project_comment_files';

-- View project_comment_reactions columns
EXEC sp_columns 'project_comment_reactions';
```

Check indexes:

```sql
-- View indexes on new tables
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_NAME IN ('project_comment_files', 'project_comment_reactions')
ORDER BY TABLE_NAME, INDEX_NAME;
```

## Table Details

### project_comment_files
**Purpose**: Store file attachments on project comments

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | INT | NO | IDENTITY(1,1) |
| comment_id | INT | NO | - |
| file_url | NVARCHAR(MAX) | NO | - |
| file_name | NVARCHAR(255) | YES | NULL |
| file_type | NVARCHAR(100) | YES | NULL |
| file_size | INT | YES | NULL |
| created_at | DATETIME2 | YES | GETUTCDATE() |

**Primary Key**: `id`
**Foreign Key**: `comment_id` → `project_comments(id)` (CASCADE DELETE)
**Indexes**: `idx_comment_files_comment` on `comment_id`

### project_comment_reactions
**Purpose**: Track star reactions on project comments

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | INT | NO | IDENTITY(1,1) |
| comment_id | INT | NO | - |
| user_id | INT | NO | - |
| reaction_type | NVARCHAR(50) | YES | 'star' |
| created_at | DATETIME2 | YES | GETUTCDATE() |

**Primary Key**: `id`
**Foreign Keys**: 
- `comment_id` → `project_comments(id)` (CASCADE DELETE)
- `user_id` → `users(id)` (CASCADE DELETE)
**Unique Constraint**: `(comment_id, user_id, reaction_type)`
**Indexes**: `idx_comment_reactions_comment` on `comment_id`

## Rollback Instructions

If you need to rollback the migration:

```sql
-- Drop tables (WARNING: This will delete all comment data)
DROP INDEX IF EXISTS idx_comment_reactions_comment ON project_comment_reactions;
DROP INDEX IF EXISTS idx_comment_files_comment ON project_comment_files;
DROP TABLE IF EXISTS project_comment_reactions;
DROP TABLE IF EXISTS project_comment_files;

PRINT 'Rollback completed - tables removed';
```

## Troubleshooting

### Error: "Cannot create index... Primary key constraint already exists"
- This means the table already exists
- The migration script includes checks to prevent this
- Re-run the script - it should report "table already exists"

### Error: "Foreign key constraint failed"
- Ensure `project_comments` table exists and has `id` column
- Ensure `users` table exists and has `id` column
- Verify foreign key relationships in database

### Error: "Cannot insert or update a NULL value"
- All required columns (non-nullable) must have values
- Check that application is providing valid data

### Query timeout
- Increase command timeout in your connection string
- Try running script during off-peak hours if database is large

## Performance Notes

- Indexes are created on `comment_id` to optimize filtering by comment
- DATETIME2 is used for high-precision timestamp storage
- NVARCHAR is used for Unicode support (file names, URLs)
- IDENTITY ensures unique, auto-incrementing primary keys

## Next Steps

After migration:
1. Restart the Node.js application
2. Test comment posting on a public project
3. Test file uploads with comments
4. Test star reactions on comments
5. Verify data appears in SQL Server Management Studio

## Support

If migration fails:
1. Check SQL Server error logs
2. Verify database permissions
3. Ensure schema compatibility
4. Contact database administrator

For application issues after migration:
1. Check Node.js console for errors
2. Verify database connection string
3. Check API endpoints are responding
4. Review browser console for client-side errors

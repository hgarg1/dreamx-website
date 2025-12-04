# Database Setup Guide

This application supports both SQLite (local development) and Azure SQL Server (production).

## Local Development (SQLite)

SQLite is used automatically when `NODE_ENV` is not set to `production` or `DB_TYPE` is not set to `sqlserver`.

The database file `dreamx.db` will be created automatically in the project root.

## Production (Azure SQL Server)

### 1. Environment Variables

Set the following environment variables in your `.env` file or production environment:

```env
NODE_ENV=production
# OR
DB_TYPE=sqlserver

SQL_DB_URL=dream-x.database.windows.net
SQL_DB_NAME=Dream X
SQL_DB_UNAME=DreamX
SQL_DB_PWORD=your_password_here
```

### 2. Database Schema Setup

Before running the application, you must set up the database schema using the provided `schema.sql` file:

1. Connect to your Azure SQL Database
2. Run the `schema.sql` file to create all tables
3. The schema file is already converted to Azure SQL Server syntax

### 3. Application Initialization

In production mode, you **MUST** call `initializeDatabase()` at application startup before using any database functions.

Add this to your `app.js` (or main entry point):

```javascript
const { initializeDatabase } = require('./db');

// At app startup (before routes are loaded)
async function startApp() {
  try {
    // Initialize database connection (SQL Server only)
    if (process.env.NODE_ENV === 'production' || process.env.DB_TYPE === 'sqlserver') {
      await initializeDatabase();
      console.log('✅ Database initialized');
    }
    
    // Continue with app startup...
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

startApp();
```

### 4. Important Notes

- **SQL Server operations are asynchronous**: While SQLite operations are synchronous, SQL Server operations return promises. The current code structure expects synchronous operations, so you may need to update functions that use SQL Server to handle async operations.

- **Schema differences**: The `schema.sql` file uses Azure SQL Server syntax. For local development, the schema is created automatically using SQLite syntax in `db.js`.

- **Connection pooling**: SQL Server uses connection pooling automatically. The connection pool is managed by the `mssql` package.

## Troubleshooting

### "Database not initialized" error
- Make sure you've called `initializeDatabase()` at app startup in production mode
- Check that your environment variables are set correctly
- Verify that the Azure SQL Database is accessible from your application

### Connection timeout errors
- Check your Azure SQL firewall rules
- Verify the server name, database name, username, and password
- Ensure your application's IP is allowed in Azure SQL firewall settings

### Schema errors
- Make sure you've run `schema.sql` to create all tables
- Check that the schema was created successfully
- Verify table names and column names match between schema.sql and your code


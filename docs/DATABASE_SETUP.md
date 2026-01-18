# Database Setup Guide

This application supports both SQLite (local development) and PostgreSQL (production).

## Local Development (SQLite)

SQLite is used automatically when `NODE_ENV` is not set to `production` or `DB_TYPE` is not set to `postgres`/`postgresql`.

The database file `dreamx.db` will be created automatically in the project root.

## Production (PostgreSQL)

### 1. Environment Variables

Set the following environment variables in your `.env` file or production environment:

```env
NODE_ENV=production
# OR
DB_TYPE=postgres
# OR
DB_TYPE=postgresql

# PostgreSQL connection settings
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=dreamx
PG_USER=postgres
PG_PASSWORD=your_password_here
PG_SSL=false  # Set to 'true' for remote connections with SSL

# Alternative environment variable names (also supported)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dreamx
DB_USER=postgres
DB_PASSWORD=your_password_here
```

### 2. Database Schema Setup

Before running the application, you must set up the database schema using the provided PostgreSQL schema files:

1. Connect to your PostgreSQL database
2. Run the `db/schema-postgres.sql` file to create all tables
3. Run the `db/rbac-schema-postgres.sql` file to create RBAC tables (if using RBAC)
4. The schema files are already converted to PostgreSQL syntax

Example using psql:
```bash
psql -U postgres -d dreamx -f db/schema-postgres.sql
psql -U postgres -d dreamx -f db/rbac-schema-postgres.sql
```

### 3. Application Initialization

In production mode, you **MUST** call `initializeDatabase()` at application startup before using any database functions.

Add this to your `app.js` (or main entry point):

```javascript
const { initializeDatabase } = require('./db');

// At app startup (before routes are loaded)
async function startApp() {
  try {
    // Initialize database connection (PostgreSQL only)
    if (process.env.NODE_ENV === 'production' || process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql') {
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

- **PostgreSQL operations are asynchronous**: While SQLite operations are synchronous, PostgreSQL operations return promises. The current code structure expects synchronous operations, so you may need to update functions that use PostgreSQL to handle async operations.

- **Schema differences**: The `schema-postgres.sql` file uses PostgreSQL syntax. For local development, the schema is created automatically using SQLite syntax in `db.js`.

- **Connection pooling**: PostgreSQL uses connection pooling automatically. The connection pool is managed by the `pg` package.

- **Session store**: In production, sessions are stored in PostgreSQL using `connect-pg-simple`. The session table is created automatically.

## Troubleshooting

### "Database not initialized" error
- Make sure you've called `initializeDatabase()` at app startup in production mode
- Check that your environment variables are set correctly
- Verify that the PostgreSQL database is accessible from your application

### Connection timeout errors
- Check your PostgreSQL firewall rules (pg_hba.conf)
- Verify the host, port, database name, username, and password
- Ensure your application's IP is allowed in PostgreSQL access rules
- For remote connections, ensure SSL is properly configured

### Schema errors
- Make sure you've run `schema-postgres.sql` to create all tables
- Check that the schema was created successfully
- Verify table names and column names match between schema-postgres.sql and your code
- Ensure you have the necessary permissions to create tables


# Neon Database Setup

This application is now configured to use **Neon PostgreSQL** in production and **SQLite** in development.

## Configuration

The application automatically detects which database to use based on environment variables:

- **Production (Neon PostgreSQL)**: Used when `DATABASE_URL` is set OR `NODE_ENV=production` OR `DB_TYPE=postgres/postgresql`
- **Development (SQLite)**: Used when none of the above conditions are met

## Environment Variables

### Production (Neon)

Set the following environment variable in your production environment:

```env
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

Or use individual PostgreSQL variables:

```env
NODE_ENV=production
PG_HOST=your-neon-host.neon.tech
PG_PORT=5432
PG_DATABASE=your-database-name
PG_USER=your-username
PG_PASSWORD=your-password
PG_SSL=true
```

### Development (SQLite)

For local development, simply **do not set** `DATABASE_URL` or `NODE_ENV=production`. The application will automatically use SQLite:

- Database file: `data/dreamx.db`
- Sessions: `data/sessions.sqlite3`

## Migration Status

✅ **Migrations have been applied to Neon production database**

- Main schema: `db/schema-postgres.sql` ✅ Applied
- RBAC schema: `db/rbac-schema-postgres.sql` ✅ Applied
- Total tables created: 76

## Running Migrations

If you need to re-run migrations or apply them to a new Neon database:

```bash
npm run db:migrate:neon
```

This script will:
1. Automatically detect `DATABASE_URL` from environment or neonctl
2. Apply both schema files
3. Verify the migration was successful

## How It Works

### Database Adapter (`db/adapter.js`)
- Automatically detects Neon connections via `DATABASE_URL`
- Configures SSL appropriately for Neon
- Falls back to individual PostgreSQL variables if `DATABASE_URL` is not set

### Session Store (`app.js`)
- Uses the same `DATABASE_URL` or PostgreSQL connection for sessions in production
- Uses SQLite for sessions in development

### Application Startup (`app.js`)
- Automatically initializes PostgreSQL/Neon when `DATABASE_URL` is set or in production mode
- Runs migrations automatically on startup if tables don't exist

## Verification

To verify your setup:

1. **Check database connection**:
   ```bash
   # In production, the app will log:
   # ✅ PostgreSQL connection successful!
   # 📊 Using DATABASE_URL connection string (Neon)
   ```

2. **Check tables**:
   ```bash
   npm run db:migrate:neon
   # Should show: ✅ Migration verification complete: Total tables created: 76
   ```

## Troubleshooting

### Issue: App still using SQLite in production
**Solution**: Ensure `DATABASE_URL` is set in your production environment, or set `NODE_ENV=production`

### Issue: SSL connection errors
**Solution**: Neon requires SSL. The app automatically enables SSL for Neon connections. If you're using individual variables, set `PG_SSL=true`

### Issue: Migrations not running
**Solution**: Run `npm run db:migrate:neon` manually. The app will also attempt to run migrations on startup if tables don't exist.

## Notes

- Neon connections are automatically detected and SSL is configured appropriately
- The migration script is idempotent - it's safe to run multiple times
- Development mode (SQLite) is used when `NODE_ENV` is not set to `production` and `DATABASE_URL` is not set
- All database operations are abstracted through the adapter, so the rest of the application doesn't need to know which database is being used

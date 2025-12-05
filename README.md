# Dream X Website

A clean, modern Node.js website for Dream X - The Social Network for Productive People.

## About Dream X

Dream X is a social-first platform that showcases productive hobbies and passions. Our mission: "Get people addicted to being productive, not scrolling."

### Key Features

- **Reverse Algorithm**: Start with ultra-specific interests and broaden your horizons
- **Social-First Feed**: Share progress on productive passions
- **Services Marketplace**: Optional tutoring, mentoring, and sessions

## Tech Stack

- **Backend**: Node.js + Express.js
- **Frontend**: EJS templates
- **Styling**: Custom CSS with modern, clean design
- **Theme Color**: Vibrant pink (#ff4fa3) on soft white/gray backgrounds

## Project Structure

```
DreamX Website/
├── app.js                 # Main server file
├── package.json           # Project dependencies
├── views/                 # EJS templates
│   ├── index.ejs         # Home page
│   ├── about.ejs         # About page
│   ├── features.ejs      # Features page
│   ├── contact.ejs       # Contact page
│   └── partials/         # Reusable components
│       ├── header.ejs    # Navigation and <head>
│       └── footer.ejs    # Footer section
└── public/               # Static assets
    ├── css/
    │   └── style.css     # Main stylesheet
    ├── js/
    │   └── main.js       # Client-side JavaScript
    └── img/              # Images (empty for now)
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. Open a terminal in the project directory
2. Install dependencies:
    ```powershell
    npm install
    ```

### Running the Server

Start the development server:
```powershell
npm start
```

Or use nodemon for auto-restart during development:
```powershell
npm run dev
```

The website will be available at: **http://localhost:3000**

## Admin Credentials

The application comes with pre-seeded admin accounts for testing and management:

### Global Admin Account
- **Email:** `admin@dreamx.local`
- **Password:** `DreamXAdmin2025!`
- **Role:** `global_admin` (highest level administrator)
- **Permissions:** Full system access, can manage all users and admins

### Business Admin Account
- **Email:** `business@dreamx.local`
- **Password:** `DreamXBusiness2025!`
- **Role:** `business_admin` (business operations administrator)
- **Permissions:** 
  - View, manage, and contact sales inquiries
  - Manage business team and subordinates
  - Enterprise account management
  - Sales analytics and revenue reports
  - **Pricing customization** - Adjust subscription tiers, pricing, and features
  - Contract and partner management
  - Customer success operations
- **Dashboard:** Access at `/business` to manage enterprise sales, team, and pricing

### HR Account
- **Email:** `hr@dreamx.local`
- **Password:** `DreamXHR2025!`
- **Role:** `hr` (Human Resources)
- **Permissions:** Access to HR dashboard, career management, talent acquisition

## Pages

- **Home** (`/`) - Hero section with mission and feature overview
- **About** (`/about`) - Dream X philosophy and story
- **Features** (`/features`) - Detailed feature descriptions
- **Contact** (`/contact`) - Contact form and FAQ

## Customization

### Colors

The theme uses vibrant pink (#ff4fa3) as the primary color. To customize, edit the CSS variables in `public/css/style.css`:

```css
:root {
    --primary-color: #ff4fa3;
    --primary-hover: #e63e8f;
    /* ... other variables */
}
```

### Content

All page content is in the `views/` folder. Edit the `.ejs` files to update text, add sections, or modify the layout.

### Styling

Modify `public/css/style.css` to adjust spacing, typography, animations, or add new styles.

## Features

### Video Livestreaming 🎥
Complete infrastructure for live video broadcasting:
- **WebRTC Streaming**: Peer-to-peer video streaming with low latency
- **Broadcasting**: Users can start livestreams with title and description
- **Viewing**: Real-time viewer joining with automatic ICE server configuration
- **Signaling**: Socket.IO based signaling for WebRTC connection establishment
- **Chat**: Live chat during streams with message persistence
- **Recording**: Automatic stream recording with configurable quality
- **Analytics**: Viewer count tracking and peak viewer metrics
- **Database**: Complete schema for streams, viewers, and chat messages
- **API Ready**: Full REST API for stream management
- **Infrastructure**: Foundation for adaptive bitrate streaming and transcoding

See `services/livestream/README.md` for complete documentation.

### Audio Support 🎵
Posts and reels now support background audio:
- **Upload Audio**: Add MP3, WAV, OGG, or M4A files to any post or reel
- **Auto-Loop**: Background audio loops seamlessly for continuous playback
- **Volume Control**: Default 30% volume with user-adjustable controls
- **Elegant Player**: Beautiful pink-gradient audio player matching the DreamX theme
- **Progress Bar**: Visual progress indicator with seek functionality
- **Infrastructure Ready**: Prepared for future livestreaming and audio recording features

### Already Implemented
- Local email/password auth, profiles, edit profile with image upload
- SQLite DB with conversations/messages, real-time messaging via Socket.IO
- Settings: account, password, notifications

### OAuth Sign-In
- Google, Microsoft, Apple (Apple requires HTTPS)

### Setup for OAuth
1) Copy `.env.example` to `.env` and fill values
2) Install strategy dependencies (if not already):
```powershell
npm install passport passport-google-oauth20 passport-microsoft passport-apple dotenv
```
3) Configure provider console redirect URLs to match:
- `http://localhost:3000/auth/google/callback`
- `http://localhost:3000/auth/microsoft/callback`
- Apple requires HTTPS: set `APPLE_CALLBACK_URL=https://<your-domain-or-ngrok>/auth/apple/callback`

Optional: import provider avatar on first login (Google supported).

## Documentation

For detailed documentation about features, implementation guides, and summaries, see the `/docs` folder:

- **[Account Deletion PWA Update](docs/ACCOUNT_DELETION_PWA_UPDATE.md)** - PWA and account deletion features
- **[API Routes Documentation](docs/api-routes-documentation.html)** - API endpoint reference
- **[Bug Fixes Summary](docs/BUG_FIXES_SUMMARY.md)** - List of resolved issues
- **[Completion Summary](docs/COMPLETION_SUMMARY.md)** - Project completion status
- **[Consolidation Summary](docs/CONSOLIDATION_SUMMARY.md)** - Codebase consolidation notes
- **[CSS Upgrade Summary](docs/CSS_UPGRADE_SUMMARY.md)** - CSS improvements and updates
- **[Data Models Documentation](docs/data-models-documentation.html)** - Database schema reference
- **[Database Setup](docs/DATABASE_SETUP.md)** - Database initialization guide
- **[DB Implementation Study](docs/DB_IMPLEMENTATION_STUDY.md)** - Database implementation details
- **[Email Setup](docs/EMAIL_SETUP.md)** - Email configuration and SMTP settings
- **[Features](docs/FEATURES.md)** - Complete feature list
- **[Features Project Comments](docs/FEATURES_PROJECT_COMMENTS.md)** - Project comments and reactions system
- **[Feed CSS Cleanup](docs/FEED_CSS_CLEANUP.md)** - Feed styling updates
- **[Feed Redesign Summary](docs/FEED_REDESIGN_SUMMARY.md)** - Feed UI/UX improvements
- **[Implementation Checklist](docs/IMPLEMENTATION_CHECKLIST.md)** - Development checklist
- **[Livestream Summary](docs/LIVESTREAM_SUMMARY.md)** - Video streaming implementation
- **[Logo Update Instructions](docs/LOGO_UPDATE_INSTRUCTIONS.md)** - Branding updates
- **[Mapbox Architecture](docs/MAPBOX_ARCHITECTURE.md)** - Map integration design
- **[Mapbox Guide](docs/MAPBOX_GUIDE.md)** - Mapbox implementation guide
- **[Mapbox Summary](docs/MAPBOX_SUMMARY.md)** - Mapbox feature summary
- **[Mapbox Utilities Comparison](docs/MAPBOX_UTILITIES_COMPARISON.md)** - Utility analysis
- **[Mobile API Auth Implementation](docs/MOBILE_API_AUTH_IMPLEMENTATION.md)** - Mobile authentication
- **[Mobile Email Update](docs/MOBILE_EMAIL_UPDATE.md)** - Mobile email features
- **[Notifications](docs/NOTIFICATIONS.md)** - Notification system documentation
- **[OAuth Redirect URI Fix](docs/OAUTH_REDIRECT_URI_FIX.md)** - OAuth configuration fix
- **[Payment Integration](docs/PAYMENT_INTEGRATION.md)** - Stripe payment system
- **[Post Widget Architecture](docs/POST_WIDGET_ARCHITECTURE.md)** - Post creation components
- **[Project System Implementation](docs/PROJECT_SYSTEM_IMPLEMENTATION.md)** - Projects feature
- **[Project System Quickstart](docs/PROJECT_SYSTEM_QUICKSTART.md)** - Projects quick reference
- **[Refund System Summary](docs/REFUND_SYSTEM_SUMMARY.md)** - Refund handling
- **[Security Summary](docs/SECURITY_SUMMARY.md)** - Security measures and best practices
- **[SQL Migration Guide](docs/SQL_MIGRATION_GUIDE.md)** - MS SQL Server migration steps
- **[System Accounts Summary](docs/SYSTEM_ACCOUNTS_SUMMARY.md)** - System account management
- **[Update Summary](docs/UPDATE_SUMMARY.md)** - Recent updates and changes
- **[User Moderation Summary](docs/USER_MODERATION_SUMMARY.md)** - User management and moderation

## License

ISC

## Tagline

**"Addicted to growth."** ✨

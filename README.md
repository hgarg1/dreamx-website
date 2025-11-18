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

## License

ISC

## Tagline

**"Addicted to growth."** ✨

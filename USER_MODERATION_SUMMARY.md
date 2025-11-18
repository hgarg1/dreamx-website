# User Moderation & Social Features Implementation Summary

## 🎯 Overview
Complete implementation of user moderation system with block/report functionality, admin oversight, and enhanced social features including following users' reel bubbles on feed.

## ✅ Implemented Features

### 1. Database Schema (db.js)
**New Tables Created:**
- `user_blocks`: Tracks user block relationships
  - blocker_id, blocked_id (UNIQUE constraint)
  - reason (optional)
  - Cascading deletes when users are deleted
  - Indexed for performance

- `user_reports`: User-generated reports for moderation review
  - reporter_id, reported_id
  - reason (required), description (optional)
  - status: pending/reviewing/resolved/dismissed
  - admin_notes, reviewed_by, reviewed_at
  - Indexed on status and dates

- `user_moderation`: Admin controls for user blocking privileges
  - user_id (UNIQUE)
  - block_functionality_locked (admin can prevent users from blocking)
  - lock_reason, locked_by, locked_at
  - Audit logging via triggers

**New DB Functions (12 total):**
1. `blockUser({ blockerId, blockedId, reason })` - Blocks user (checks if blocker is locked first)
2. `unblockUser({ blockerId, blockedId })` - Removes block
3. `isUserBlocked({ userId, targetId })` - Checks if blocked (bidirectional)
4. `getBlockedUsers(userId)` - Returns all users blocked by userId
5. `reportUser({ reporterId, reportedId, reason, description })` - Creates report
6. `getUserReports({ limit, offset, status })` - Gets reports with optional status filter
7. `updateReportStatus({ reportId, status, reviewerId, adminNotes })` - Updates report
8. `lockUserBlockFunctionality({ userId, reason, lockedBy })` - Admin locks block ability
9. `unlockUserBlockFunctionality({ userId, unlockedBy })` - Admin unlocks
10. `getUserModerationStatus(userId)` - Gets moderation record
11. `getAllBlocksAndReports({ limit, offset })` - Admin view of all blocks
12. All functions include username fields for display

### 2. User API Routes (app.js)
**Block/Unblock Routes:**
- `POST /api/users/:id/block` - Block user with optional reason
  - Returns 403 if blocker's functionality is locked by admin
- `POST /api/users/:id/unblock` - Unblock user
- `GET /api/users/blocked` - Get current user's blocked list
- `GET /api/users/:id/is-blocked` - Check block status

**Report Route:**
- `POST /api/users/:id/report` - Report user with reason + description
  - Creates pending report for admin review

**Following Reels Route:**
- `GET /api/users/following/reels?tzOffset=X` - Returns following users with active reels (48h window)
  - Includes user info, profile picture, reel count
  - Used for feed sidebar bubbles

### 3. Admin Moderation Routes (app.js)
**Admin Portal Routes (super_admin only):**
- `GET /admin/moderation/user-actions` - View all blocks & reports
  - Paginated, shows status, usernames, dates
- `POST /admin/moderation/reports/:id/status` - Update report status
  - Set to pending/reviewing/resolved/dismissed
  - Add admin notes
- `POST /admin/moderation/users/:id/lock-blocking` - Lock user's block ability
  - Prevents abuse of blocking system
  - Existing blocks remain
- `POST /admin/moderation/users/:id/unlock-blocking` - Unlock block ability

### 4. Admin Portal UI (views/)
**New View: admin-user-actions.ejs**
- Two tabs: User Reports | User Blocks
- **Reports Tab:**
  - Table: ID, Reporter, Reported User, Reason, Status Badge, Date, Actions
  - Review modal with status dropdown + admin notes
  - Status badges: pending (yellow), reviewing (blue), resolved (green), dismissed (red)
- **Blocks Tab:**
  - Table: ID, Blocker, Blocked User, Reason, Date, Lock Status, Actions
  - Shows if blocker is locked (red badge)
  - Lock/unlock blocker buttons
- Gradient theme matching site design
- Responsive table design

**Updated View: admin-consolidated.ejs**
- Added "User Moderation" tab (super_admin only)
- Links to full moderation portal
- Consistent with other admin tabs

### 5. Feed Page Enhancements (feed.ejs)
**Reels Bubbles Sidebar:**
- Displays following users with active reels (48h window)
- Profile picture with gradient ring: `linear-gradient(135deg, #ff4fa3, #764ba2)`
- Shows username + reel count
- Click → navigates to `profile/:username?viewReels=true`
- Empty state when no active reels
- Auto-loads on page load via fetch

**Layout Changes:**
- Sidebar reorganized: Reels bubbles at top, passions below
- Divider between sections

### 6. Profile Page User Actions (profile.ejs)
**Visitor Actions Menu (non-owners only):**
- Three-dot menu button (⋮) next to Message button
- Dropdown menu:
  - 🚫 Block User
  - ⚠️ Report User

**Block Modal:**
- Title: "🚫 Block User"
- Explanation of blocking effects
- Optional reason dropdown:
  - Harassment or bullying
  - Spam or unwanted content
  - Inappropriate behavior
  - Other
- Cancel / Block User buttons
- 403 error handling if user's blocking is locked

**Report Modal:**
- Title: "⚠️ Report User"
- Required reason dropdown:
  - Harassment or threats
  - Spam or scam
  - Inappropriate content
  - Impersonation
  - Hate speech
  - Violence or harmful behavior
  - Other
- Optional description textarea
- Submit Report button
- Success confirmation alert

**JavaScript Integration:**
- `toggleUserActionsMenu()` - Show/hide menu
- `openBlockModal()` / `closeBlockModal()` - Modal controls
- `openReportModal()` / `closeReportModal()` - Modal controls
- `confirmBlock()` - Async POST to `/api/users/:id/block`
- `confirmReport()` - Async POST to `/api/users/:id/report`
- Click-outside-to-close for menus

## 🎨 UI/UX Features
**Consistent Gradient Theme:**
- Primary: `linear-gradient(135deg, #ff4fa3, #764ba2)`
- Hover effects with transform + shadow
- Glassmorphism on modals: `backdrop-filter: blur(4px)`

**Status Badges:**
- Color-coded: Green (resolved), Red (dismissed), Yellow (pending), Blue (reviewing)
- Uppercase, rounded pills

**Responsive Design:**
- Tables scroll horizontally on mobile
- Modals centered with max-width constraints
- Touch-friendly button sizes

## 🔒 Security & Permissions
**Access Control:**
- Block/report routes: Require authentication (`req.session.userId`)
- Admin routes: `requireSuperAdmin` middleware
- Cannot block/report self (validation)

**Admin Override Powers:**
- Lock users' blocking functionality (prevent abuse)
- Review all reports with notes
- Change report statuses
- View all blocks across platform

**Audit Logging:**
- All moderation actions logged to `audit_logs` via DB triggers
- Tracks: user_id, action, details, timestamp

## 📊 Data Flow Examples

### User Blocks Another User:
1. Visitor clicks Block on profile → modal opens
2. Selects reason → clicks "Block User"
3. Frontend: `POST /api/users/123/block { reason: "spam" }`
4. Backend checks if blocker is locked in `user_moderation`
5. If not locked: Insert into `user_blocks`, return success
6. If locked: Return 403 with error message
7. Frontend: Show alert, reload page

### User Reports Another User:
1. Visitor clicks Report → modal opens
2. Fills reason + description → clicks "Submit Report"
3. Frontend: `POST /api/users/123/report { reason: "harassment", description: "..." }`
4. Backend: Insert into `user_reports` with status='pending'
5. Frontend: Show success alert

### Admin Reviews Report:
1. Admin visits `/admin/moderation/user-actions`
2. Clicks "Review" on report → modal opens with details
3. Changes status to "resolved", adds notes
4. Submits form: `POST /admin/moderation/reports/5/status`
5. Backend: Updates report, logs to audit
6. Redirects with success message

### Following Users' Reels:
1. User visits `/feed`
2. Page loads, executes: `GET /api/users/following/reels?tzOffset=300`
3. Backend:
   - Gets following list for current user
   - For each: Counts reels created in last 48h (timezone-aware)
   - Filters to users with count > 0
   - Returns: `{ users: [{ id, username, full_name, profile_picture, reelCount }] }`
4. Frontend: Renders bubbles with gradient rings
5. User clicks bubble → navigate to profile with `?viewReels=true`

## 🔧 Files Modified/Created

### Modified:
- `db.js`: +3 tables, +12 functions
- `app.js`: +9 routes (block/report/admin)
- `views/feed.ejs`: Reels bubbles sidebar
- `views/profile.ejs`: Block/report menu + modals
- `views/admin-consolidated.ejs`: User Moderation tab

### Created:
- `views/admin-user-actions.ejs`: Full admin moderation portal

## 🚀 Usage

### As a User:
1. **View Following Reels:** Visit `/feed`, see bubbles on left sidebar
2. **Block Someone:** Visit their profile → ⋮ menu → Block User → confirm
3. **Report Someone:** Visit their profile → ⋮ menu → Report User → fill form → submit
4. **Manage Blocks:** Visit settings to view/unblock (route to be added)

### As Admin:
1. **Review Reports:** Admin portal → User Moderation tab → User Reports
2. **Update Report:** Click Review → change status → add notes → submit
3. **Lock Blocker:** Blocks tab → click "Lock Blocker" → provide reason → submit
4. **Unlock Blocker:** Click "Unlock Blocker" button

## 📝 Notes
- All reels expire after 48 hours (configurable in API endpoints)
- Blocking is bidirectional (both users hidden from each other)
- Admins can lock specific users from blocking others (anti-abuse)
- Reports create notifications for admin team (future enhancement)
- Email notifications for moderation actions (future enhancement)

## ✨ Next Steps (Optional Enhancements)
1. Settings page to view/manage blocked users
2. Email notifications for report submissions
3. Bulk moderation actions in admin panel
4. Report analytics dashboard
5. Auto-moderation rules based on report patterns
6. User appeal system for locked blocking functionality

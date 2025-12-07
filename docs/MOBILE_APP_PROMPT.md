# Dream X - Android Mobile Application Development Prompt

## Overview

Build a native Android mobile application for **Dream X**, a social media platform with marketplace and project management features. The app should be built using **Jetpack Compose** with **Material 3 (M3) Design System** from Google, following modern Android development best practices.

---

## Tech Stack Requirements

### Core Technologies
- **Language**: Kotlin
- **UI Framework**: Jetpack Compose (latest stable)
- **Design System**: Material 3 (M3) with dynamic color theming
- **Architecture**: MVVM with Clean Architecture layers
- **Dependency Injection**: Hilt (Dagger-Hilt)
- **Navigation**: Jetpack Navigation Compose
- **State Management**: Kotlin StateFlow / SharedFlow
- **Networking**: Retrofit 2 + OkHttp + Kotlin Coroutines
- **JSON Parsing**: Kotlinx Serialization or Moshi
- **Image Loading**: Coil (Compose-native)
- **Video Playback**: ExoPlayer / Media3
- **Local Storage**: Room Database + DataStore (Preferences)
- **Real-time Communication**: Socket.IO Android client
- **WebRTC**: For livestreaming (Google WebRTC library)
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Authentication**: JWT tokens stored securely in EncryptedSharedPreferences

### Minimum SDK & Targets
- **minSdk**: 26 (Android 8.0)
- **targetSdk**: 34 (Android 14)
- **compileSdk**: 34

---

## API Base Configuration

The backend already provides mobile-ready API endpoints with JWT authentication:

### Authentication Endpoints
```
POST /api/auth/login          - Email/password login, returns access + refresh tokens
POST /api/auth/register       - User registration
POST /api/auth/refresh        - Refresh access token
POST /api/auth/logout         - Revoke refresh token
POST /api/auth/logout-all     - Revoke all user tokens
GET  /api/auth/me             - Get current user profile
POST /api/auth/forgot-password - Request password reset
POST /api/auth/reset-password  - Complete password reset
POST /api/auth/verify-email    - Verify email with 6-digit code
POST /api/auth/resend-verification - Resend verification code
```

### Token Format
- **Access Token**: JWT, expires in 15 minutes
- **Refresh Token**: Random hex string, expires in 30 days
- **Header**: `Authorization: Bearer <access_token>`

---

## Application Features & Screens

### 1. Authentication Module

#### 1.1 Splash Screen
- App logo animation (Lottie or custom Compose animation)
- Check for stored auth tokens
- Auto-navigate to Feed or Login based on auth state
- Handle token refresh if access token expired

#### 1.2 Login Screen
**UI Elements:**
- Email input field with validation
- Password input field with visibility toggle
- "Remember me" checkbox
- "Forgot Password?" link
- Primary login button
- Social login buttons (Google, Microsoft, Apple, X/Twitter)
- "Don't have an account? Sign up" link

**API Integration:**
```kotlin
POST /api/auth/login
Body: { email: String, password: String }
Response: { success: Boolean, data: { accessToken, refreshToken, user } }
```

**OAuth Implementation:**
- Use AppAuth library for OAuth 2.0 flows
- Redirect URLs: `dreamx://auth/callback/{provider}`
- Store tokens securely after successful OAuth

#### 1.3 Registration Screen
**UI Elements:**
- Full name input
- Email input with validation
- Handle (@username) input with availability check
- Password input with strength indicator
- Confirm password input
- Terms of Service checkbox
- Register button
- Social registration options

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**API Integration:**
```kotlin
POST /api/auth/register
Body: { fullName, email, password, handle? }
Response: { success, data: { accessToken, refreshToken, user, message } }
```

#### 1.4 Email Verification Screen
- Display masked email address
- 6-digit OTP input (6 individual boxes, auto-focus next)
- Countdown timer for resend (15 minutes expiry)
- "Resend Code" button
- Progress indicator during verification

**API Integration:**
```kotlin
POST /api/auth/verify-email
Header: Authorization: Bearer <token>
Body: { code: String }
Response: { success, data: { message, verified, user } }
```

#### 1.5 Forgot Password Screen
- Email input
- Submit button
- Success message (always show generic message for security)

#### 1.6 Reset Password Screen (Deep Link)
- New password input
- Confirm password input
- Submit button
- Handle deep link: `dreamx://reset-password?token={token}`

---

### 2. Main Feed Module

#### 2.1 Feed Screen (Home)
**UI Layout:**
- Top app bar with logo, search icon, notifications bell (with badge)
- Stories/Reels row (horizontal scrollable avatars with ring indicator)
- Post feed (vertical scrollable, lazy loading)
- Floating Action Button for creating new post
- Bottom navigation bar

**Post Card Component:**
```kotlin
@Composable
fun PostCard(
    post: Post,
    onLikeClick: () -> Unit,
    onCommentClick: () -> Unit,
    onRepostClick: () -> Unit,
    onShareClick: () -> Unit,
    onProfileClick: () -> Unit,
    onPostClick: () -> Unit
)
```

**Post Types:**
1. **Text Post**: Simple text content with optional title
2. **Image Post**: Single or multiple images with carousel
3. **Video Post**: Video player with play/pause, mute, fullscreen
4. **Reel**: Full-screen vertical video (TikTok-style)
5. **Quote Repost**: Embedded original post with quote text

**Post Reactions:**
- Like button with count (heart icon, animated on tap)
- Comment count with icon
- Repost count with icon
- Share button

**API Endpoints:**
```kotlin
GET /feed - Returns paginated posts (use query: limit, offset, userId)
GET /api/posts/{postId}/reactions - Get reaction counts
POST /api/posts/{postId}/react - Like/unlike (body: { type: "like" })
GET /api/posts/{postId}/comments - Get comments
POST /api/posts/{postId}/comments - Add comment
POST /api/posts/{postId}/repost - Create repost
```

#### 2.2 Reels Viewer
**UI Layout:**
- Full-screen vertical pager (ViewPager2 style)
- Video auto-play when visible
- Overlay controls: like, comment, share, user avatar
- Double-tap to like animation
- Swipe up/down to navigate reels
- User profile info overlay at bottom

**Reel Features:**
- 48-hour expiry (show remaining time)
- View count
- Auto-advance to next reel

**API:**
```kotlin
GET /api/users/{userId}/reels - Get user's active reels
GET /api/users/following/reels - Get reels from followed users
```

#### 2.3 Create Post Screen
**UI Layout:**
- Text input area (expandable)
- Title input (optional)
- Media picker (photos, videos, camera)
- Activity label selector (e.g., "Working on...", "Learning...")
- Hashtag suggestions (auto-complete)
- Tag people functionality
- Post visibility options
- "Post" button

**Media Limits (enforce client-side):**
- Images: Max 10MB
- Videos: Max 400MB, Max 5 minutes
- Audio: Max 25MB

**Content Types:**
- `text` - Text only
- `image` - With image attachment
- `video` - Video/Reel
- `audio` - With audio attachment

**API:**
```kotlin
POST /feed/post
Content-Type: multipart/form-data
Fields: contentType, textContent, activityLabel, title?, postTags?, media?, audio?
```

#### 2.4 Post Detail Screen
- Full post content
- Comments section with nested replies
- Comment input at bottom
- Pull-to-refresh for new comments
- Like/Reply on individual comments

#### 2.5 Search Screen
**UI Layout:**
- Search bar with auto-suggest
- Recent searches
- Search results tabs: Users, Posts, Hashtags
- User search results with follow button

**API:**
```kotlin
GET /search?q={query} - Search users
GET /api/users/search?q={query} - API search
GET /api/hashtags/popular?q={query} - Hashtag suggestions
```

---

### 3. Profile Module

#### 3.1 Profile Screen
**UI Layout:**
- Banner image (parallax effect on scroll)
- Profile picture (circular, with border)
- Display name and @handle
- Bio text
- Stats row: Posts | Followers | Following
- Action buttons:
  - Own profile: "Edit Profile"
  - Other users: "Follow/Unfollow", "Message"
- Tabs: Posts | Reposts | Services | Projects
- Grid/List toggle for posts

**API Endpoints:**
```kotlin
GET /profile - Current user profile (redirects, use /api/auth/me instead)
GET /profile/{userId} - Other user's profile
POST /api/users/{userId}/follow - Follow user
POST /api/users/{userId}/unfollow - Unfollow user
GET /api/users/{userId}/profile-counts - Get post/service counts
```

#### 3.2 Edit Profile Screen
**UI Layout:**
- Profile picture picker with crop
- Banner image picker
- Full name input
- Bio text area (multi-line)
- Location input
- Skills/interests chips selector
- Passions/categories multi-select
- Custom interests input
- Save button

**API:**
```kotlin
POST /profile/edit
Content-Type: multipart/form-data
Fields: displayName, bio, passions[], skills, location, profilePicture?, bannerImage?
```

#### 3.3 Followers/Following List
- Tab layout: Followers | Following
- User list items with follow/unfollow buttons
- Pull-to-refresh

#### 3.4 Blocked Users Screen
- List of blocked users
- Unblock button per user

**API:**
```kotlin
GET /api/users/blocked
POST /api/users/{userId}/block
POST /api/users/{userId}/unblock
```

---

### 4. Messaging Module

#### 4.1 Conversations List Screen
**UI Layout:**
- Search bar for conversations
- New message FAB
- Conversation list items:
  - Profile picture
  - Name
  - Last message preview (truncated)
  - Timestamp
  - Unread badge

**Real-time Updates:**
- Socket.IO connection for new messages
- Join user room on app start: `socket.emit('join-user-room', userId)`

**API:**
```kotlin
GET /messages - Get all conversations (web redirects, use API)
GET /api/messages/{conversationId} - Get messages for conversation
```

#### 4.2 Chat Screen
**UI Layout:**
- Top bar with user/group name, avatar, more options
- Messages list (lazy column, paginated)
- Message bubbles:
  - Sent (right, primary color)
  - Received (left, surface color)
  - Timestamps (grouped by day)
  - Read receipts
  - Reactions display
- Message input bar:
  - Text field
  - Attachment button (files, images)
  - Send button
- Reply preview when replying to message
- Typing indicator

**Message Types:**
- Text message
- Image attachment
- File attachment
- Reply to message

**Socket Events:**
```kotlin
// Join conversation room
socket.emit("join-conversation", conversationId)

// Send message (via API, then broadcast via socket)
socket.on("new-message") { /* Update UI */ }

// Typing indicators
socket.emit("typing", { conversationId, userId, name })
socket.emit("stop-typing", { conversationId, userId })
socket.on("typing") { /* Show typing indicator */ }

// Read receipts
socket.on("read-receipt") { /* Update read status */ }

// Message reactions
socket.on("message-reaction") { /* Update reaction */ }
```

**API:**
```kotlin
POST /api/messages/send
Content-Type: multipart/form-data
Fields: conversationId, content?, replyToMessageId?, file?

POST /api/messages/{conversationId}/read - Mark as read
POST /api/messages/{messageId}/react - React to message
```

#### 4.3 New Conversation Screen
- User search
- Create conversation on user select

**API:**
```kotlin
GET /messages/start/{userId} - Create/get conversation (web redirect)
// For mobile, create conversation via messaging the user
```

#### 4.4 Group Chat
- Create group with multiple participants
- Update group name
- Add/remove members
- Leave group

**API:**
```kotlin
POST /messages/group/create - Create group
POST /messages/group/{id}/name - Update name
POST /messages/group/{id}/add - Add member
POST /messages/group/{id}/remove - Remove member
POST /messages/group/{id}/leave - Leave group
```

---

### 5. Services Marketplace Module

#### 5.1 Services Browse Screen
**UI Layout:**
- Category filter chips (horizontal scroll)
- Price range filter
- Experience level filter
- Format filter (online/in-person)
- Services grid (2 columns)
- Search bar

**Service Card:**
- Service image/placeholder
- Title
- Provider name with avatar
- Price per session
- Rating stars and count
- Category tag

**Categories:**
```
Tutoring, Mentorship, Coaching, Workshops, Consulting,
Design Services, Development, Writing & Content,
Marketing & SEO, Video & Photography, Audio & Music,
Business Strategy, Legal Services, Financial Planning,
Health & Wellness, Language Learning, Career Services,
Data & Analytics, Virtual Assistance, Project Management, Other
```

**API:**
```kotlin
GET /services?category=&priceRange=&experience=&format=
```

#### 5.2 Service Detail Screen
**UI Layout:**
- Service images carousel
- Title and category
- Provider info card (tap to view profile)
- Price and duration
- Rating summary (stars, count, breakdown)
- Description
- "What's Included" list
- "Ideal For" list
- Reviews list with load more
- "Book Session" button (sticky bottom)

**API:**
```kotlin
GET /services/{id}
GET /api/services/{id}/reviews
POST /services/{id}/book
```

#### 5.3 Create Service Screen
**UI Layout:**
- Multi-step form wizard:
  1. Basic Info (title, description, category)
  2. Pricing (hourly rate, session duration)
  3. Details (experience level, format, availability)
  4. Media (images, optional video)
- Progress indicator
- Next/Back/Submit buttons

**Eligibility Check:**
- Check subscription tier before creating
- Show upgrade prompt if limit reached

**API:**
```kotlin
GET /api/services/check-eligibility
POST /api/services/create
```

#### 5.4 My Services Screen
- List of user's services
- Edit/Delete options
- Stats per service

---

### 6. Projects Module

#### 6.1 Projects Feed Screen
**UI Layout:**
- Project cards in list
- Create project FAB
- Filter by category/status

**Project Card:**
- Cover image
- Title
- Owner info
- Progress bar
- Status badge
- View count

**API:**
```kotlin
GET /projects - Public projects feed
GET /api/projects/{id} - Project details
```

#### 6.2 Project Detail Screen
**UI Layout:**
- Cover image with parallax
- Title and description
- Owner info
- Progress ring/bar
- Status badge
- Tags
- Goals list
- Tabs: Updates | Milestones | Tasks | Comments
- React to updates
- Comment on project

**API:**
```kotlin
GET /api/projects/{id}
GET /api/projects/{id}/comments
POST /api/projects/{id}/comments
POST /api/projects/{id}/updates/{updateId}/react
```

#### 6.3 Create/Edit Project Screen
**UI Layout:**
- Step wizard or single form
- Title input
- Description rich text
- Category selector
- Visibility (public/private)
- Tags input
- Goals input
- Target completion date
- Cover image picker

**API:**
```kotlin
POST /api/projects
PUT /api/projects/{id}
DELETE /api/projects/{id}
```

#### 6.4 Milestones & Tasks
- Create/edit milestones
- Create/edit tasks
- Status updates
- Due date tracking

---

### 7. Notifications Module

#### 7.1 Notifications Screen
**UI Layout:**
- Notification list
- Mark all as read button
- Pull-to-refresh
- Empty state

**Notification Types:**
- `follow` - New follower
- `reaction` - Post/message reaction
- `comment` - New comment
- `reply` - Comment reply
- `message` - New message
- `repost` - Post reposted
- `service_review` - New review

**Notification Item:**
- Icon based on type
- Title and message
- Timestamp
- Unread indicator
- Tap action (navigate to relevant screen)

**API:**
```kotlin
GET /api/notifications?limit=50&offset=0
POST /api/notifications/{id}/read
POST /api/notifications/read-all
```

#### 7.2 Push Notifications (FCM)
**Implementation:**
1. Initialize FCM in Application class
2. Get FCM token on registration/login
3. Send token to backend (create endpoint or use existing push subscription)
4. Handle incoming notifications
5. Deep link handling

**Notification Channels (Android O+):**
- Messages (high priority)
- Social (default priority)
- Services (default priority)
- Projects (low priority)

---

### 8. Settings Module

#### 8.1 Settings Screen
**UI Layout:**
- Grouped list of settings options

**Settings Groups:**
1. **Account**
   - Edit Profile
   - Change Handle
   - Change Password
   - Connected Accounts

2. **Privacy**
   - Profile Visibility (Public/Members/Private)
   - Who Can Message Me
   - Discoverable by Email
   - Online Status
   - Read Receipts

3. **Notifications**
   - Email Notifications toggle
   - Push Notifications toggle
   - Message Notifications toggle

4. **Billing**
   - Current Plan
   - Payment Methods
   - Billing History
   - Upgrade/Downgrade

5. **Blocked Users**
   - List and manage

6. **Support**
   - Help Center
   - Contact Us
   - Terms of Service
   - Privacy Policy

7. **Account Actions**
   - Logout
   - Delete Account

**API:**
```kotlin
POST /settings/account - Update account
POST /settings/password - Change password
POST /settings/notifications - Update notification prefs
POST /settings/privacy - Update privacy settings
POST /settings/connections/unlink - Unlink OAuth
POST /settings/delete-account - Delete account (requires confirmation)
```

#### 8.2 Subscription/Billing Screen
**UI Layout:**
- Current plan card
- Plan comparison cards
- Feature comparison table
- Upgrade/Downgrade buttons
- Payment method management
- Invoice history

**Subscription Tiers:**
```kotlin
enum class SubscriptionTier(val displayName: String, val price: String) {
    FREE("Free", "$0/mo"),
    PRO_BUYER("Pro Buyer", "$5.99/mo"),
    PRO_SELLER("Pro Seller", "$9.99/mo"),
    ELITE_SELLER("Elite Seller", "$29.99/mo")
}
```

**API:**
```kotlin
GET /billing - Get subscription info
POST /api/checkout/subscribe - Subscribe to plan
POST /api/subscription/cancel - Cancel subscription
POST /api/payment-methods/add - Add payment method
```

---

### 9. Livestreaming Module

#### 9.1 Active Streams Screen
- Grid of live streams
- Viewer count per stream
- Thumbnail preview

**API:**
```kotlin
GET /api/livestream/active
```

#### 9.2 Watch Stream Screen
- Full-screen video player (WebRTC)
- Live chat overlay
- Viewer count
- Like/React button
- Share button

**WebRTC Implementation:**
1. Fetch ICE servers from API
2. Create peer connection
3. Handle signaling via Socket.IO
4. Display remote video stream

**Socket Events:**
```kotlin
socket.emit("join-livestream", streamId)
socket.on("chat:message") { /* Display chat */ }
```

**API:**
```kotlin
GET /api/livestream/{streamId}
POST /api/livestream/{streamId}/join
POST /api/livestream/{streamId}/leave
GET /api/livestream/{streamId}/chat
POST /api/livestream/{streamId}/chat
```

#### 9.3 Go Live Screen (Broadcaster)
- Camera preview
- Title and description input
- Start/Stop stream buttons
- Viewer count display
- Chat moderation

**API:**
```kotlin
POST /api/livestream/create
POST /api/livestream/{streamId}/start
POST /api/livestream/{streamId}/end
```

---

## UI/UX Design Guidelines

### Material 3 Theme Configuration

```kotlin
@Composable
fun DreamXTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true, // Android 12+ dynamic colors
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(LocalContext.current)
            else dynamicLightColorScheme(LocalContext.current)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    
    MaterialTheme(
        colorScheme = colorScheme,
        typography = DreamXTypography,
        shapes = DreamXShapes,
        content = content
    )
}
```

### Brand Colors (Fallback)
```kotlin
// Primary - Vibrant accent
val Primary = Color(0xFF6366F1)      // Indigo
val OnPrimary = Color(0xFFFFFFFF)
val PrimaryContainer = Color(0xFFE0E7FF)

// Secondary
val Secondary = Color(0xFF8B5CF6)    // Purple
val OnSecondary = Color(0xFFFFFFFF)

// Tertiary
val Tertiary = Color(0xFFEC4899)     // Pink

// Background/Surface
val Background = Color(0xFFFAFAFA)
val Surface = Color(0xFFFFFFFF)
val SurfaceVariant = Color(0xFFF3F4F6)

// Dark Theme
val BackgroundDark = Color(0xFF121212)
val SurfaceDark = Color(0xFF1E1E1E)
```

### Typography
```kotlin
val DreamXTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.Default, // Or custom font
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 40.sp
    ),
    headlineMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 32.sp
    ),
    titleLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 28.sp
    ),
    bodyLarge = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp
    )
)
```

### Component Patterns

#### Bottom Navigation
```kotlin
NavigationBar {
    NavigationBarItem(
        icon = { Icon(Icons.Default.Home, "Home") },
        label = { Text("Home") },
        selected = currentRoute == "feed"
    )
    NavigationBarItem(
        icon = { Icon(Icons.Default.Search, "Search") },
        label = { Text("Search") },
        selected = currentRoute == "search"
    )
    NavigationBarItem(
        icon = { Icon(Icons.Default.Store, "Services") },
        label = { Text("Services") },
        selected = currentRoute == "services"
    )
    NavigationBarItem(
        icon = { 
            BadgedBox(badge = { if (unread > 0) Badge { Text("$unread") } }) {
                Icon(Icons.Default.Chat, "Messages")
            }
        },
        label = { Text("Messages") },
        selected = currentRoute == "messages"
    )
    NavigationBarItem(
        icon = { Icon(Icons.Default.Person, "Profile") },
        label = { Text("Profile") },
        selected = currentRoute == "profile"
    )
}
```

#### Pull-to-Refresh
```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshableFeed(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    content: @Composable () -> Unit
) {
    val pullRefreshState = rememberPullToRefreshState()
    
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        state = pullRefreshState
    ) {
        content()
    }
}
```

#### Loading States
- Skeleton loading for content (shimmer effect)
- Circular progress for actions
- Linear progress for file uploads

#### Empty States
- Custom illustrations
- Helpful message
- Action button when applicable

#### Error States
- Snackbar for temporary errors
- Full-screen error with retry for critical failures
- Inline error messages for form validation

### Animations
- Shared element transitions between screens
- Like animation (heart burst)
- Smooth scroll-based app bar collapse
- Bottom sheet enter/exit animations
- Loading shimmer effect

### Accessibility
- Content descriptions for all icons
- Sufficient color contrast (WCAG AA)
- Touch targets minimum 48dp
- Screen reader support
- Focus indicators

---

## Data Layer Architecture

### Repository Pattern
```kotlin
interface PostRepository {
    suspend fun getFeed(limit: Int, offset: Int): Result<List<Post>>
    suspend fun likePost(postId: Int): Result<LikeResponse>
    suspend fun createPost(request: CreatePostRequest): Result<Post>
    suspend fun getComments(postId: Int): Result<List<Comment>>
    suspend fun addComment(postId: Int, content: String, parentId: Int?): Result<Comment>
}

class PostRepositoryImpl @Inject constructor(
    private val api: DreamXApi,
    private val postDao: PostDao
) : PostRepository {
    // Implementation with caching
}
```

### API Service
```kotlin
interface DreamXApi {
    @GET("api/auth/me")
    suspend fun getCurrentUser(): Response<ApiResponse<UserResponse>>
    
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<ApiResponse<AuthResponse>>
    
    @GET("feed")
    suspend fun getFeed(
        @Query("limit") limit: Int,
        @Query("offset") offset: Int
    ): Response<List<PostResponse>>
    
    @POST("api/posts/{postId}/react")
    suspend fun reactToPost(
        @Path("postId") postId: Int,
        @Body reaction: ReactionRequest
    ): Response<ApiResponse<ReactionResponse>>
    
    // ... other endpoints
}
```

### Auth Interceptor
```kotlin
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        // Skip auth for public endpoints
        if (originalRequest.url.encodedPath.contains("/api/auth/login") ||
            originalRequest.url.encodedPath.contains("/api/auth/register")) {
            return chain.proceed(originalRequest)
        }
        
        val token = tokenManager.getAccessToken()
        if (token == null) {
            return chain.proceed(originalRequest)
        }
        
        val authenticatedRequest = originalRequest.newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        
        val response = chain.proceed(authenticatedRequest)
        
        // Handle 401 - try refresh
        if (response.code == 401) {
            response.close()
            val newToken = runBlocking { tokenManager.refreshToken() }
            if (newToken != null) {
                val retryRequest = originalRequest.newBuilder()
                    .addHeader("Authorization", "Bearer $newToken")
                    .build()
                return chain.proceed(retryRequest)
            }
        }
        
        return response
    }
}
```

### Token Manager
```kotlin
class TokenManager @Inject constructor(
    private val encryptedPrefs: SharedPreferences,
    private val api: AuthApi
) {
    fun getAccessToken(): String? = encryptedPrefs.getString("access_token", null)
    
    fun getRefreshToken(): String? = encryptedPrefs.getString("refresh_token", null)
    
    fun saveTokens(accessToken: String, refreshToken: String) {
        encryptedPrefs.edit()
            .putString("access_token", accessToken)
            .putString("refresh_token", refreshToken)
            .apply()
    }
    
    suspend fun refreshToken(): String? {
        val refreshToken = getRefreshToken() ?: return null
        try {
            val response = api.refresh(RefreshRequest(refreshToken))
            if (response.isSuccessful && response.body()?.success == true) {
                val newAccessToken = response.body()?.data?.accessToken
                if (newAccessToken != null) {
                    encryptedPrefs.edit()
                        .putString("access_token", newAccessToken)
                        .apply()
                    return newAccessToken
                }
            }
        } catch (e: Exception) {
            // Handle error
        }
        return null
    }
    
    fun clearTokens() {
        encryptedPrefs.edit().clear().apply()
    }
}
```

---

## Data Models

### User
```kotlin
@Serializable
data class User(
    val id: Int,
    val email: String,
    val fullName: String,
    val handle: String,
    val profilePicture: String? = null,
    val bannerImage: String? = null,
    val bio: String? = null,
    val emailVerified: Boolean = false,
    val accountStatus: String = "active",
    val role: String = "user",
    val createdAt: String
)
```

### Post
```kotlin
@Serializable
data class Post(
    val id: Int,
    val userId: Int,
    val title: String? = null,
    val contentType: String = "text",
    val textContent: String? = null,
    val mediaUrl: String? = null,
    val audioUrl: String? = null,
    val imageUrl: String? = null,
    val videoUrl: String? = null,
    val externalVideoUrl: String? = null,
    val isReel: Boolean = false,
    val activityLabel: String? = null,
    val createdAt: String,
    // Joined fields
    val fullName: String? = null,
    val profilePicture: String? = null,
    val reactions: ReactionCounts? = null,
    val userReaction: String? = null,
    val commentsCount: Int = 0,
    val repostInfo: RepostInfo? = null
)
```

### Message
```kotlin
@Serializable
data class Message(
    val id: Int,
    val conversationId: Int,
    val senderId: Int,
    val content: String,
    val attachmentUrl: String? = null,
    val attachmentMime: String? = null,
    val replyToMessageId: Int? = null,
    val read: Boolean = false,
    val createdAt: String,
    // Joined
    val senderName: String? = null,
    val senderPicture: String? = null,
    val reactionCounts: Map<String, Int>? = null
)
```

### Service
```kotlin
@Serializable
data class Service(
    val id: Int,
    val userId: Int,
    val title: String,
    val description: String,
    val category: String,
    val pricePerHour: Double,
    val durationMinutes: Int = 60,
    val experienceLevel: String? = null,
    val format: String? = null,
    val availability: String? = null,
    val location: String? = null,
    val tags: String? = null,
    val imageUrl: String? = null,
    val status: String = "active",
    val createdAt: String,
    // Joined
    val fullName: String? = null,
    val profilePicture: String? = null,
    val ratingAvg: Double? = null,
    val ratingCount: Int? = null
)
```

### Conversation
```kotlin
@Serializable
data class Conversation(
    val id: Int,
    val user1Id: Int,
    val user2Id: Int,
    val isGroup: Boolean = false,
    val groupName: String? = null,
    val createdAt: String,
    // Computed
    val otherUserId: Int? = null,
    val otherUserName: String? = null,
    val otherUserPicture: String? = null,
    val lastMessage: String? = null,
    val lastMessageTime: String? = null,
    val unreadCount: Int = 0
)
```

### Notification
```kotlin
@Serializable
data class Notification(
    val id: Int,
    val userId: Int,
    val type: String,
    val title: String,
    val message: String,
    val link: String? = null,
    val read: Boolean = false,
    val createdAt: String
)
```

### Project
```kotlin
@Serializable
data class Project(
    val id: Int,
    val ownerId: Int,
    val title: String,
    val description: String? = null,
    val coverImage: String? = null,
    val category: String? = null,
    val status: String = "planning",
    val visibility: String = "public",
    val progressPercent: Int = 0,
    val startDate: String? = null,
    val targetEndDate: String? = null,
    val tags: List<String> = emptyList(),
    val goals: List<String> = emptyList(),
    val viewCount: Int = 0,
    val createdAt: String,
    // Joined
    val ownerName: String? = null,
    val ownerPicture: String? = null
)
```

---

## Navigation Structure

```kotlin
sealed class Screen(val route: String) {
    // Auth
    object Splash : Screen("splash")
    object Login : Screen("login")
    object Register : Screen("register")
    object VerifyEmail : Screen("verify-email")
    object ForgotPassword : Screen("forgot-password")
    object ResetPassword : Screen("reset-password/{token}")
    
    // Main
    object Feed : Screen("feed")
    object Search : Screen("search")
    object CreatePost : Screen("create-post")
    object PostDetail : Screen("post/{postId}")
    object Reels : Screen("reels/{userId}?startIndex={startIndex}")
    
    // Profile
    object Profile : Screen("profile/{userId}")
    object EditProfile : Screen("edit-profile")
    object Followers : Screen("profile/{userId}/followers")
    object Following : Screen("profile/{userId}/following")
    
    // Messages
    object Conversations : Screen("conversations")
    object Chat : Screen("chat/{conversationId}")
    object NewMessage : Screen("new-message")
    
    // Services
    object Services : Screen("services")
    object ServiceDetail : Screen("service/{serviceId}")
    object CreateService : Screen("create-service")
    object EditService : Screen("edit-service/{serviceId}")
    
    // Projects
    object Projects : Screen("projects")
    object ProjectDetail : Screen("project/{projectId}")
    object CreateProject : Screen("create-project")
    object EditProject : Screen("edit-project/{projectId}")
    
    // Notifications
    object Notifications : Screen("notifications")
    
    // Settings
    object Settings : Screen("settings")
    object AccountSettings : Screen("settings/account")
    object PrivacySettings : Screen("settings/privacy")
    object NotificationSettings : Screen("settings/notifications")
    object Billing : Screen("billing")
    object BlockedUsers : Screen("blocked-users")
    
    // Livestream
    object LiveStreams : Screen("live")
    object WatchStream : Screen("live/{streamId}")
    object GoLive : Screen("go-live")
}
```

---

## Offline Support

### Caching Strategy
1. **Feed posts**: Cache last 100 posts in Room
2. **User profiles**: Cache visited profiles
3. **Conversations**: Cache conversation list and recent messages
4. **Pending actions**: Queue likes, comments for sync when online

### Room Database
```kotlin
@Database(
    entities = [
        PostEntity::class,
        UserEntity::class,
        ConversationEntity::class,
        MessageEntity::class,
        PendingActionEntity::class
    ],
    version = 1
)
abstract class DreamXDatabase : RoomDatabase() {
    abstract fun postDao(): PostDao
    abstract fun userDao(): UserDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    abstract fun pendingActionDao(): PendingActionDao
}
```

---

## Testing Requirements

### Unit Tests
- ViewModel tests with mock repositories
- Repository tests with mock API
- Token refresh logic
- Data transformations

### UI Tests
- Login flow
- Post creation
- Navigation
- Form validation

### Integration Tests
- API calls with mock server
- Database operations
- Socket.IO events

---

## Performance Optimization

1. **Lazy Loading**: Use `LazyColumn`/`LazyVerticalGrid` for all lists
2. **Image Caching**: Coil disk cache with proper sizing
3. **Video Preloading**: Preload next reel while viewing current
4. **Pagination**: Load data in pages of 20-50 items
5. **Background Sync**: WorkManager for periodic sync
6. **Memory Management**: Clear image cache on low memory
7. **Network Optimization**: HTTP caching headers, GZIP compression

---

## Security Considerations

1. **Token Storage**: Use EncryptedSharedPreferences
2. **Certificate Pinning**: Pin SSL certificates
3. **Input Validation**: Sanitize all user inputs
4. **Biometric Auth**: Optional fingerprint/face unlock
5. **Secure WebView**: For OAuth flows
6. **Root Detection**: Warn on rooted devices
7. **Screenshot Prevention**: For sensitive screens (optional)

---

## Project Structure

```
app/
├── src/main/
│   ├── java/com/dreamx/app/
│   │   ├── DreamXApplication.kt
│   │   ├── MainActivity.kt
│   │   │
│   │   ├── data/
│   │   │   ├── api/
│   │   │   │   ├── DreamXApi.kt
│   │   │   │   ├── AuthApi.kt
│   │   │   │   └── models/
│   │   │   ├── local/
│   │   │   │   ├── DreamXDatabase.kt
│   │   │   │   ├── dao/
│   │   │   │   └── entities/
│   │   │   ├── repository/
│   │   │   │   ├── AuthRepository.kt
│   │   │   │   ├── PostRepository.kt
│   │   │   │   ├── MessageRepository.kt
│   │   │   │   └── ...
│   │   │   └── socket/
│   │   │       └── SocketManager.kt
│   │   │
│   │   ├── di/
│   │   │   ├── AppModule.kt
│   │   │   ├── NetworkModule.kt
│   │   │   └── DatabaseModule.kt
│   │   │
│   │   ├── domain/
│   │   │   ├── model/
│   │   │   └── usecase/
│   │   │
│   │   ├── ui/
│   │   │   ├── theme/
│   │   │   │   ├── Theme.kt
│   │   │   │   ├── Color.kt
│   │   │   │   ├── Typography.kt
│   │   │   │   └── Shapes.kt
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── PostCard.kt
│   │   │   │   ├── UserAvatar.kt
│   │   │   │   ├── LoadingIndicator.kt
│   │   │   │   └── ...
│   │   │   │
│   │   │   ├── navigation/
│   │   │   │   ├── NavGraph.kt
│   │   │   │   └── Screen.kt
│   │   │   │
│   │   │   └── screens/
│   │   │       ├── auth/
│   │   │       ├── feed/
│   │   │       ├── profile/
│   │   │       ├── messages/
│   │   │       ├── services/
│   │   │       ├── projects/
│   │   │       ├── notifications/
│   │   │       └── settings/
│   │   │
│   │   └── util/
│   │       ├── TokenManager.kt
│   │       ├── NetworkUtils.kt
│   │       └── Extensions.kt
│   │
│   └── res/
│       ├── values/
│       │   ├── strings.xml
│       │   ├── themes.xml
│       │   └── colors.xml
│       └── ...
│
├── build.gradle.kts
└── proguard-rules.pro
```

---

## Build Configuration

### build.gradle.kts (app)
```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.dagger.hilt.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    kotlin("kapt")
}

android {
    namespace = "com.dreamx.app"
    compileSdk = 34
    
    defaultConfig {
        applicationId = "com.dreamx.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        
        buildConfigField("String", "API_BASE_URL", "\"https://dream-x.app\"")
    }
    
    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2\"") // Emulator localhost
        }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
}

dependencies {
    // Compose BOM
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    
    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    
    // Lifecycle
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    
    // Hilt
    implementation("com.google.dagger:hilt-android:2.50")
    kapt("com.google.dagger:hilt-compiler:2.50")
    
    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    
    // Image Loading
    implementation("io.coil-kt:coil-compose:2.5.0")
    implementation("io.coil-kt:coil-video:2.5.0")
    
    // Video Player
    implementation("androidx.media3:media3-exoplayer:1.2.1")
    implementation("androidx.media3:media3-ui:1.2.1")
    
    // Room
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
    
    // DataStore
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    
    // Socket.IO
    implementation("io.socket:socket.io-client:2.1.0")
    
    // Security
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    
    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:32.7.2"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    
    // WebRTC (for livestreaming)
    implementation("io.getstream:stream-webrtc-android:1.1.0")
}
```

---

## Delivery Milestones

### Phase 1: Foundation (Week 1-2)
- Project setup and architecture
- Authentication module (login, register, token management)
- Basic navigation structure
- Theme and design system

### Phase 2: Core Features (Week 3-4)
- Feed screen with posts
- Create post functionality
- Profile screens
- Basic settings

### Phase 3: Social Features (Week 5-6)
- Comments and reactions
- Follow system
- Reels viewer
- User search

### Phase 4: Messaging (Week 7-8)
- Conversations list
- Chat screen with real-time
- File attachments
- Typing indicators

### Phase 5: Marketplace & Projects (Week 9-10)
- Services browsing
- Service details
- Projects feed
- Project details

### Phase 6: Advanced Features (Week 11-12)
- Push notifications
- Livestreaming
- Billing/subscriptions
- Offline support

### Phase 7: Polish & Testing (Week 13-14)
- UI/UX refinements
- Performance optimization
- Testing
- Bug fixes

---

## Notes

1. **API Compatibility**: The backend already has mobile-ready `/api/auth/*` endpoints. Use these for all authentication flows.

2. **Image URLs**: Profile pictures and media URLs from the API may be relative (e.g., `/uploads/profiles/...`). Prepend the base URL when loading.

3. **WebSocket**: Use Socket.IO client for real-time features. The server uses Socket.IO with CORS configured.

4. **File Uploads**: Use `multipart/form-data` for all file uploads. Follow the same field names as the web app.

5. **Error Handling**: API returns `{ success: boolean, data?: T, error?: string }` format. Handle both success and error cases.

6. **Rate Limiting**: The backend has rate limiting. Implement exponential backoff for retries.

7. **Deep Links**: Support `dreamx://` scheme for password reset and OAuth callbacks.

This prompt provides a comprehensive blueprint for building the Dream X Android application. Follow Material 3 guidelines, implement proper error handling, and ensure offline-first capabilities for the best user experience.

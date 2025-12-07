# Dream X - Admin, HR & Business Mobile Application Development Prompt

## Overview

Build the **Admin, HR, and Business Dashboard modules** for the Dream X Android mobile application. This document extends the main mobile app to include comprehensive management screens for **Administrators**, **HR Managers**, and **Business Account Holders**. These screens should seamlessly integrate with the existing Dream X mobile app and provide full access to administrative, HR, and business management functionality on the go.

---

## Target Users & Roles

### Role Hierarchy (by Priority)
```kotlin
enum class AdminRole(val priority: Int, val displayName: String) {
    USER(1, "User"),
    HR(20, "HR"),
    SUPER_HR(30, "Super HR"),
    GLOBAL_HR(40, "Global HR"),
    BUSINESS_ADMIN(40, "Business Admin"),
    ADMIN(50, "Admin"),
    SUPER_ADMIN(60, "Super Admin"),
    GLOBAL_ADMIN(100, "Global Admin")
}
```

### Role Capabilities Overview
| Role | Capabilities |
|------|-------------|
| **Admin** | User management, content moderation, services moderation, refunds, appeals |
| **Super Admin** | All Admin + Role management, User bans/suspensions, Audit logs |
| **Global Admin** | All Super Admin + Database access, Storage management, System configuration |
| **HR** | Career applications, Job postings, Candidate pipeline |
| **Super HR** | All HR + HR team management, Scope management |
| **Global HR** | All Super HR + Audit access, Scope locks |
| **Business Admin** | Sales inquiries, Business team, Pricing management, Enterprise accounts |

---

## Tech Stack Requirements

Uses the same tech stack as the main app:
- **Language**: Kotlin
- **UI Framework**: Jetpack Compose (latest stable)
- **Design System**: Material 3 (M3) with dynamic color theming
- **Architecture**: MVVM with Clean Architecture layers
- **Dependency Injection**: Hilt (Dagger-Hilt)
- **Navigation**: Jetpack Navigation Compose
- **State Management**: Kotlin StateFlow / SharedFlow
- **Networking**: Retrofit 2 + OkHttp + Kotlin Coroutines
- **Biometrics**: Optional secure authentication for admin actions

---

## Navigation Structure

### Admin Navigation
```kotlin
sealed class AdminScreen(val route: String) {
    // Admin Dashboard
    object AdminDashboard : AdminScreen("admin/dashboard")
    object AdminStats : AdminScreen("admin/stats")
    
    // User Management
    object UserManagement : AdminScreen("admin/users")
    object UserDetail : AdminScreen("admin/users/{userId}")
    object UserStats : AdminScreen("admin/users/{userId}/stats")
    object UserNotes : AdminScreen("admin/users/{userId}/notes")
    object CreateUser : AdminScreen("admin/users/create")
    
    // Content Moderation
    object ContentModeration : AdminScreen("admin/moderation")
    object PostModeration : AdminScreen("admin/moderation/posts")
    object CommentModeration : AdminScreen("admin/moderation/comments")
    object ServiceModeration : AdminScreen("admin/services")
    object ServiceDetail : AdminScreen("admin/services/{serviceId}")
    
    // Appeals & Requests
    object RefundRequests : AdminScreen("admin/refunds")
    object RefundDetail : AdminScreen("admin/refunds/{requestId}")
    object ContentAppeals : AdminScreen("admin/appeals/content")
    object AccountAppeals : AdminScreen("admin/appeals/account")
    object AppealDetail : AdminScreen("admin/appeals/{appealId}")
    
    // Reports & Blocks
    object UserReports : AdminScreen("admin/reports")
    object ReportDetail : AdminScreen("admin/reports/{reportId}")
    object BlocksOverview : AdminScreen("admin/blocks")
    
    // Audit & Logs
    object AuditLogs : AdminScreen("admin/audit")
    object AuditLogDetail : AdminScreen("admin/audit/{logId}")
    
    // RBAC Management (Super Admin+)
    object RbacDashboard : AdminScreen("admin/rbac")
    object RoleManagement : AdminScreen("admin/rbac/roles")
    object RoleDetail : AdminScreen("admin/rbac/roles/{roleId}")
    object PermissionManagement : AdminScreen("admin/rbac/permissions")
    object UserRoleAssignment : AdminScreen("admin/rbac/users")
    object RbacOverrides : AdminScreen("admin/rbac/overrides")
    object RbacAudit : AdminScreen("admin/rbac/audit")
    
    // System Management (Global Admin)
    object DatabaseExplorer : AdminScreen("admin/database")
    object TableViewer : AdminScreen("admin/database/{tableName}")
    object StorageExplorer : AdminScreen("admin/storage")
}
```

### HR Navigation
```kotlin
sealed class HrScreen(val route: String) {
    // HR Dashboard
    object HrDashboard : HrScreen("hr/dashboard")
    
    // Career Applications
    object Applications : HrScreen("hr/applications")
    object ApplicationDetail : HrScreen("hr/applications/{applicationId}")
    
    // Job Management
    object JobPostings : HrScreen("hr/jobs")
    object JobDetail : HrScreen("hr/jobs/{jobId}")
    object CreateJob : HrScreen("hr/jobs/create")
    object EditJob : HrScreen("hr/jobs/{jobId}/edit")
    
    // HR Team (Super HR+)
    object HrTeam : HrScreen("hr/team")
    object HrMemberDetail : HrScreen("hr/team/{memberId}")
    object CreateHrMember : HrScreen("hr/team/create")
    
    // Candidate Outreach
    object CandidateOutreach : HrScreen("hr/outreach")
    object ComposeEmail : HrScreen("hr/outreach/compose")
}
```

### Business Navigation
```kotlin
sealed class BusinessScreen(val route: String) {
    // Business Dashboard
    object BusinessDashboard : BusinessScreen("business/dashboard")
    
    // Sales Inquiries
    object SalesInquiries : BusinessScreen("business/sales")
    object InquiryDetail : BusinessScreen("business/sales/{inquiryId}")
    
    // Business Team
    object BusinessTeam : BusinessScreen("business/team")
    object TeamMemberDetail : BusinessScreen("business/team/{memberId}")
    object AddTeamMember : BusinessScreen("business/team/add")
    
    // Pricing Management
    object PricingManagement : BusinessScreen("business/pricing")
    object PricingTierDetail : BusinessScreen("business/pricing/{tierId}")
    object CreatePricingTier : BusinessScreen("business/pricing/create")
    
    // Communications
    object Communications : BusinessScreen("business/communications")
    object ComposeFollowUp : BusinessScreen("business/communications/compose")
}
```

---

## Module 1: Admin Dashboard

### 1.1 Admin Dashboard Home

**Purpose**: Central hub for administrators showing key metrics, recent activity, and quick actions.

**UI Layout**:
- Top app bar with "Admin Dashboard" title and settings gear
- Stats cards row (horizontal scroll or grid):
  - Total Users count with trend
  - Pending Refunds with badge
  - Open Appeals count
  - Active Services count
- Quick Actions section:
  - Create User button
  - Moderate Content button
  - View Reports button
- Recent Activity list:
  - Latest audit log entries
  - New refund requests
  - Recent appeals
- Navigation drawer or bottom sheet with admin sections

**API Endpoints**:
```kotlin
GET /admin - Dashboard stats (web redirect, parse or use dedicated API)
GET /api/notifications?limit=20 - Recent admin notifications
```

**Data Model**:
```kotlin
@Serializable
data class AdminStats(
    val totalUsers: Int,
    val totalPosts: Int,
    val totalServices: Int,
    val totalMessages: Int,
    val pendingRefunds: Int,
    val openAppeals: Int,
    val newCareerApplications: Int,
    val recentActivity: List<AuditLogEntry>
)

@Serializable
data class AuditLogEntry(
    val id: Int,
    val userId: Int?,
    val action: String,
    val details: String?,
    val createdAt: String,
    val actorName: String?,
    val actorEmail: String?
)
```

### 1.2 User Management Screen

**Purpose**: View, search, and manage all platform users.

**UI Layout**:
- Search bar with filters dropdown
- Filter chips: All, Admins, HR, Business, Suspended, Banned
- User list with lazy loading:
  - Profile avatar
  - Name and email
  - Role badge (color-coded)
  - Account status indicator
  - Last active timestamp
- FAB to create new user
- Pull-to-refresh

**User List Item**:
```kotlin
@Composable
fun UserListItem(
    user: UserSummary,
    onUserClick: () -> Unit,
    onQuickAction: (UserAction) -> Unit
)

data class UserSummary(
    val id: Int,
    val fullName: String,
    val email: String,
    val role: String,
    val profilePicture: String?,
    val accountStatus: String, // "active", "suspended", "banned"
    val createdAt: String,
    val lastActive: String?
)
```

**API Endpoints**:
```kotlin
GET /admin - With pagination: ?page=1&pageSize=20&q=search
POST /admin/users/wizard - Create user
POST /admin/users/{id}/role - Update role (Super Admin)
POST /admin/users/{id}/permissions - Update permissions
POST /admin/users/{id}/ban - Ban user
POST /admin/users/{id}/suspend - Suspend user
POST /admin/users/{id}/unban - Restore user
```

### 1.3 User Detail Screen

**Purpose**: View comprehensive user information and perform admin actions.

**UI Layout**:
- Collapsible header with user profile info
- Stats section:
  - Posts count
  - Comments count
  - Followers/Following
  - Services count
  - Account age
- Tabs:
  - **Overview**: Basic info, account status, verification status
  - **Activity**: Recent posts, comments
  - **Notes**: Admin notes (add/view)
  - **Actions**: Ban, Suspend, Freeze seller, Freeze chat
- Action buttons based on permissions

**Admin Actions Dialog**:
```kotlin
@Composable
fun AdminActionDialog(
    actionType: AdminActionType,
    onConfirm: (reason: String?, duration: String?, notifyUser: Boolean) -> Unit,
    onDismiss: () -> Unit
)

enum class AdminActionType {
    BAN, SUSPEND, UNBAN, FREEZE_SELLER, UNFREEZE_SELLER, FREEZE_CHAT, UNFREEZE_CHAT
}
```

**API Endpoints**:
```kotlin
GET /admin/users/{id}/stats - User statistics
GET /admin/users/{id}/notes - Admin notes
POST /admin/users/{id}/notes - Add note
POST /admin/users/{id}/ban - Ban with reason
POST /admin/users/{id}/suspend - Suspend with duration
POST /admin/users/{id}/unban - Unban
POST /admin/users/{id}/freeze-seller - Freeze seller privileges
POST /admin/users/{id}/freeze-chat - Freeze chat privileges
```

### 1.4 Create User Wizard

**Purpose**: Create new user or admin accounts with role assignment.

**UI Layout**:
- Multi-step wizard:
  1. **Basic Info**: Full name, email, password
  2. **Role Selection**: Role dropdown with descriptions
  3. **Permissions**: Permission checkboxes (for admin roles)
  4. **Scopes**: Scope selection (for HR/admin roles)
  5. **Review**: Summary before creation
- Progress indicator
- Next/Back/Create buttons

**Create User Request**:
```kotlin
@Serializable
data class CreateUserRequest(
    val fullName: String,
    val email: String,
    val password: String,
    val role: String,
    val permissions: List<String>?,
    val scopes: List<String>?
)
```

**API**:
```kotlin
POST /admin/users/wizard
Body: CreateUserRequest
Response: { success: Boolean, userId: Int?, error: String? }
```

---

## Module 2: Content Moderation

### 2.1 Services Moderation Screen

**Purpose**: Review and moderate service listings.

**UI Layout**:
- Filter bar: All, Active, Hidden, Deleted
- Search bar
- Service cards grid (2 columns):
  - Service image thumbnail
  - Title
  - Provider name
  - Status badge
  - Price
  - Rating
- Tap to view details
- Swipe actions: Hide, Restore, Delete

**API Endpoints**:
```kotlin
GET /admin/services?status={status}&page={page}&q={query}
POST /admin/services/{id}/hide - Hide service
POST /admin/services/{id}/unhide - Restore service
POST /admin/services/{id}/delete - Delete service
POST /admin/services/{id}/edit - Edit service (Super Admin)
```

### 2.2 Service Moderation Detail

**UI Layout**:
- Service images carousel
- Service info card
- Provider info card (tap to view profile)
- Moderation history
- Action buttons:
  - Hide (with notification options)
  - Restore
  - Delete (with reason input)
  - Edit (Super Admin)
- Notification toggles: Email, In-App

**Moderation Action Sheet**:
```kotlin
@Composable
fun ModerationActionSheet(
    service: Service,
    onHide: (notifyEmail: Boolean, notifyInApp: Boolean) -> Unit,
    onUnhide: (notifyEmail: Boolean, notifyInApp: Boolean) -> Unit,
    onDelete: (reason: String?, notifyEmail: Boolean, notifyInApp: Boolean) -> Unit
)
```

### 2.3 Post/Comment Moderation

**UI Layout**:
- Tab layout: Posts | Comments
- Filter chips: Reported, All, Hidden
- Content list with:
  - Content preview
  - Author info
  - Report count (if reported)
  - Created date
- Swipe to hide/delete/restore

**API Endpoints**:
```kotlin
POST /admin/posts/{id}/hide
POST /admin/posts/{id}/delete
POST /admin/comments/{id}/hide
POST /admin/comments/{id}/delete
POST /admin/comments/{id}/restore
```

---

## Module 3: Appeals & Refunds

### 3.1 Refund Requests Screen

**Purpose**: Manage refund requests from users.

**UI Layout**:
- Filter chips: All, Pending, Processing, Approved, Denied, Refunded
- Refund request cards:
  - User info
  - Amount
  - Reason preview
  - Status badge
  - Date submitted
  - Priority indicator
- Tap to view details

**Data Model**:
```kotlin
@Serializable
data class RefundRequest(
    val id: Int,
    val userId: Int,
    val userEmail: String,
    val userName: String,
    val amount: Double,
    val currency: String,
    val reason: String,
    val status: String, // pending, processing, approved, denied, refunded
    val transactionId: String?,
    val createdAt: String,
    val reviewedBy: Int?,
    val reviewedAt: String?,
    val adminNotes: String?,
    val refundAmount: Double?
)
```

**API Endpoints**:
```kotlin
GET /admin/refund-requests/{id} - Get refund details with audit trail
POST /admin/refund-requests/{id}/update - Update status
Body: { status: String, adminNotes: String?, refundAmount: Double? }
```

### 3.2 Refund Detail Screen

**UI Layout**:
- Request info card:
  - User profile with link
  - Amount requested
  - Transaction details
  - Reason (full text)
  - Submitted date
- Status timeline/audit trail
- Action section:
  - Status dropdown
  - Admin notes input
  - Refund amount input (if partial)
  - Update button
- Quick status buttons: Approve, Deny, Mark Refunded

### 3.3 Appeals Screen

**Purpose**: Handle content and account appeals.

**UI Layout**:
- Tab layout: Content Appeals | Account Appeals
- Filter chips: Open, Under Review, Approved, Denied
- Appeal cards:
  - Appeal type icon
  - User info
  - Subject/title
  - Status badge
  - Date

**Data Models**:
```kotlin
@Serializable
data class ContentAppeal(
    val id: Int,
    val userId: Int,
    val email: String,
    val name: String,
    val contentType: String, // post, comment, service
    val contentId: Int?,
    val reason: String,
    val status: String, // open, under_review, approved, denied
    val createdAt: String,
    val reviewerId: Int?,
    val reviewedAt: String?
)

@Serializable
data class AccountAppeal(
    val id: Int,
    val userId: Int,
    val email: String,
    val name: String,
    val appealType: String, // ban, suspension
    val reason: String,
    val status: String,
    val createdAt: String,
    val reviewerId: Int?,
    val reviewedAt: String?
)
```

**API Endpoints**:
```kotlin
POST /admin/appeals/content/{id}/status - Update content appeal
POST /admin/appeals/account/{id}/status - Update account appeal
Body: { status: String }
```

---

## Module 4: User Reports & Blocks

### 4.1 User Reports Screen

**Purpose**: Review user reports against other users (Super Admin+).

**UI Layout**:
- Filter chips: Pending, Reviewing, Resolved, Dismissed
- Report cards:
  - Reporter info
  - Reported user info
  - Report type/reason
  - Date
  - Status badge

**API Endpoints**:
```kotlin
GET /admin/moderation/user-actions - Get blocks and reports
POST /admin/moderation/reports/{id}/status
Body: { status: String, adminNotes: String? }
```

### 4.2 Block Management

**Purpose**: View user blocks and manage block functionality.

**UI Layout**:
- Blocks list:
  - Blocker info
  - Blocked user info
  - Date blocked
- Actions: Lock/Unlock block functionality for abusive users

**API Endpoints**:
```kotlin
POST /admin/moderation/users/{id}/lock-blocking
Body: { reason: String }
POST /admin/moderation/users/{id}/unlock-blocking
```

---

## Module 5: Audit Logs

### 5.1 Audit Logs Screen

**Purpose**: View system audit trail (Super Admin+).

**UI Layout**:
- Date range picker
- Filter by action type dropdown
- Filter by actor search
- Audit log list:
  - Action type with icon
  - Actor name
  - Target/details preview
  - Timestamp
- Tap to view full details

**Data Model**:
```kotlin
@Serializable
data class AuditLog(
    val id: Int,
    val userId: Int?,
    val action: String,
    val details: String?,
    val createdAt: String,
    val actorName: String?,
    val actorEmail: String?,
    val ipAddress: String?
)
```

---

## Module 6: RBAC Management (Super Admin+)

### 6.1 RBAC Dashboard

**Purpose**: Overview of the role-based access control system.

**UI Layout**:
- Stats cards:
  - Total Roles
  - Total Permissions
  - User Assignments
  - Active Overrides
  - Audit logs today
- Quick links to sub-sections
- Recent RBAC changes

**API Endpoints**:
```kotlin
GET /rbac/dashboard - RBAC stats
GET /rbac/api/roles/tree - Role hierarchy tree
```

### 6.2 Role Management Screen

**UI Layout**:
- Search bar
- Include disabled toggle
- Role cards with:
  - Role name and display name
  - Description
  - User count badge
  - Permission count
  - System role indicator
  - Priority level
- Tap to view/edit role
- FAB to create new role (Global Admin)

**Data Model**:
```kotlin
@Serializable
data class RbacRole(
    val id: Int,
    val name: String,
    val displayName: String,
    val description: String?,
    val isSystemRole: Boolean,
    val isEnabled: Boolean,
    val priority: Int,
    val parentRoleId: Int?,
    val parentRoleName: String?,
    val userCount: Int,
    val permissionCount: Int,
    val createdAt: String,
    val updatedAt: String?
)
```

### 6.3 Role Detail Screen

**UI Layout**:
- Role header with name, description
- Tabs:
  - **Permissions**: List of assigned permissions (direct + inherited)
  - **Users**: Users with this role
  - **History**: Version history
- Edit button (if not system role)
- Permission assignment UI

### 6.4 Permission Management

**UI Layout**:
- Group by module/group accordion
- Search permissions
- Permission list items:
  - Permission name
  - Display name
  - Description
  - Module tag
  - Enabled status

### 6.5 User Role Assignment

**UI Layout**:
- User search
- User list with current roles
- Tap user to manage roles:
  - Current roles list
  - Add role dropdown
  - Remove role button
  - Temporary role with expiration

**API Endpoints**:
```kotlin
POST /rbac/api/bulk/execute
Body: { operation: "assign_role", targets: [userId], data: { roleId: Int } }
```

---

## Module 7: HR Dashboard

### 7.1 HR Dashboard Home

**Purpose**: Central hub for HR team members.

**UI Layout**:
- Stats overview:
  - Total Applications
  - New Applications (badge)
  - Under Review
  - Accepted
  - Rejected
- Active Job Postings list
- Recent Applications carousel
- Quick actions: Review Applications, Manage Jobs

**API Endpoints**:
```kotlin
GET /hr - HR dashboard data
GET /api/hr/career-jobs - Job postings list
```

**Data Model**:
```kotlin
@Serializable
data class HrStats(
    val totalApplications: Int,
    val newApplications: Int,
    val underReview: Int,
    val accepted: Int,
    val rejected: Int
)
```

### 7.2 Career Applications Screen

**Purpose**: Review and manage job applications.

**UI Layout**:
- Filter chips: All, New, Under Review, Accepted, Rejected
- Search by name/email
- Application cards:
  - Applicant name
  - Email
  - Position applied
  - Status badge
  - Date applied
- Swipe actions: Quick status update
- Tap for details

**Data Model**:
```kotlin
@Serializable
data class CareerApplication(
    val id: Int,
    val name: String,
    val email: String,
    val phone: String?,
    val position: String,
    val coverLetter: String?,
    val resumeUrl: String?,
    val status: String, // new, under_review, accepted, rejected
    val createdAt: String,
    val reviewerId: Int?,
    val reviewedAt: String?
)
```

**API Endpoints**:
```kotlin
POST /admin/careers/{id}/status
Body: { status: String }
```

### 7.3 Application Detail Screen

**UI Layout**:
- Applicant info card:
  - Name, email, phone
  - Position applied for
  - Applied date
- Cover letter section (expandable)
- Resume viewer/download button
- Status timeline
- Action buttons:
  - Set to Under Review
  - Accept
  - Reject
- Contact applicant button → Compose email

### 7.4 Job Postings Management

**Purpose**: Create and manage career opportunities.

**UI Layout**:
- Filter: All, Live, Scheduled, Draft, Frozen, Closed
- Job cards:
  - Title
  - Location
  - Employment type
  - Status badge
  - Posted date
  - Application count
- FAB to create new job
- Swipe to change status

**Data Model**:
```kotlin
@Serializable
data class CareerJob(
    val id: Int,
    val title: String,
    val location: String?,
    val team: String?,
    val employmentType: String?, // full-time, part-time, contract, intern
    val seniority: String?,
    val headline: String?,
    val description: String,
    val responsibilities: String?,
    val requirements: String?,
    val perks: String?,
    val tags: List<String>,
    val salaryMin: Double?,
    val salaryMax: Double?,
    val salaryCurrency: String?,
    val applyUrl: String?,
    val workplaceType: String?, // remote, hybrid, on-site
    val visibility: String, // public, internal
    val priority: String?,
    val status: String, // draft, scheduled, live, frozen, closed
    val goLiveAt: String?,
    val freezeUntil: String?,
    val createdAt: String,
    val updatedAt: String?
)
```

### 7.5 Create/Edit Job Screen

**UI Layout**:
- Form sections:
  - **Basic Info**: Title, headline, location, team
  - **Employment**: Type, seniority, workplace type
  - **Description**: Rich text for description, responsibilities, requirements, perks
  - **Compensation**: Salary range, currency
  - **Tags**: Tags input chips
  - **Scheduling**: Status, go-live date, freeze until
  - **Assets**: File attachments
- Preview button
- Save as Draft / Publish buttons

**API Endpoints**:
```kotlin
POST /api/hr/career-jobs - Create job (multipart for assets)
PATCH /api/hr/career-jobs/{id} - Update job
PATCH /api/hr/career-jobs/{id}/status - Quick status update
DELETE /api/hr/career-jobs/{jobId}/assets/{assetId} - Remove asset
```

### 7.6 HR Team Management (Super HR+)

**Purpose**: Manage HR team members and their permissions.

**UI Layout**:
- Team member list:
  - Name, email
  - HR role (HR, Super HR)
  - Scopes badges
  - Locked indicator
- FAB to add team member
- Tap to manage member

**HR Permission Definitions**:
```kotlin
val HR_PERMISSIONS = listOf(
    Permission("hr_applications", "Applications & Review", "View and triage candidate submissions."),
    Permission("hr_pipeline", "Pipeline Moves", "Advance, reject, and tag candidates in the pipeline."),
    Permission("hr_jobs", "Job Posts", "Create and update open roles and publishing status."),
    Permission("hr_messages", "Candidate Outreach", "Email and message candidates from the HR desk."),
    Permission("hr_team", "HR Team Management", "Create HR teammates and assign their scopes."),
    Permission("hr_scopes", "Scope Stewardship", "Add or retire scopes for downstream HR workflows.")
)
```

**API Endpoints**:
```kotlin
GET /api/hr/team - Get HR team
POST /api/hr/accounts - Create HR account
POST /api/hr/accounts/{id}/scopes - Update scopes
POST /api/hr/accounts/{id}/permissions - Update permissions
```

### 7.7 Candidate Outreach

**Purpose**: Contact candidates via email.

**UI Layout**:
- Select recipient (from applications)
- Email compose form:
  - To (pre-filled)
  - Subject
  - Message body (rich text)
- Send button

**API**:
```kotlin
POST /hr/send-email
Body: { applicantId, applicantEmail, applicantName, subject, message }
```

---

## Module 8: Business Dashboard

### 8.1 Business Dashboard Home

**Purpose**: Central hub for business administrators.

**UI Layout**:
- Sales stats cards:
  - Total Inquiries
  - New Inquiries (badge)
  - Urgent count
  - Closed this month
- Recent inquiries list
- Team overview (if has permission)
- Quick actions

**API Endpoints**:
```kotlin
GET /business - Dashboard data
```

**Data Model**:
```kotlin
@Serializable
data class SalesStats(
    val total: Int,
    val new: Int,
    val urgent: Int,
    val closedThisMonth: Int,
    val conversionRate: Double?
)
```

### 8.2 Sales Inquiries Screen

**Purpose**: Manage enterprise sales inquiries.

**UI Layout**:
- Filter chips: All, New, In Progress, Closed
- Priority filter: All, Low, Medium, High, Urgent
- Assigned to filter dropdown
- Search bar
- Inquiry cards:
  - Company name
  - Contact name
  - Priority badge (color-coded)
  - Status badge
  - Date
  - Assigned to avatar
- Pull-to-refresh
- Tap for details

**Data Model**:
```kotlin
@Serializable
data class SalesInquiry(
    val id: Int,
    val companyName: String,
    val companySize: String?,
    val industry: String?,
    val contactName: String,
    val contactEmail: String,
    val contactPhone: String?,
    val contactTitle: String?,
    val message: String,
    val interestedIn: String?,
    val budget: String?,
    val timeline: String?,
    val status: String, // new, contacted, qualified, negotiating, closed_won, closed_lost
    val priority: String, // low, medium, high, urgent
    val assignedTo: Int?,
    val assignedToName: String?,
    val source: String?,
    val createdAt: String,
    val updatedAt: String?,
    val closedAt: String?,
    val outcome: String?,
    val outcomeNotes: String?
)
```

**API Endpoints**:
```kotlin
GET /business/sales?status={status}&priority={priority}&page={page}
```

### 8.3 Inquiry Detail Screen

**UI Layout**:
- Company info card:
  - Company name, size, industry
- Contact info card:
  - Name, title, email, phone
  - Contact buttons (call, email)
- Inquiry details:
  - Message (full)
  - Interested in
  - Budget
  - Timeline
- Status and priority management:
  - Status dropdown
  - Priority selector
  - Notes input
- Assignment:
  - Assigned to dropdown
- Communications tab:
  - Email history
  - Internal notes
- Action buttons:
  - Send Follow-up Email
  - Add Note
  - Close Inquiry

**API Endpoints**:
```kotlin
GET /business/sales/{id} - Inquiry details with communications
POST /api/business/sales/{id}/status - Update status/priority
POST /api/business/sales/{id}/assign - Assign to team member
POST /api/business/sales/{id}/email - Send follow-up email
POST /api/business/sales/{id}/note - Add internal note
POST /api/business/sales/{id}/close - Close inquiry
```

### 8.4 Business Team Management

**Purpose**: Manage subordinate business admins.

**UI Layout**:
- Team hierarchy view
- Team member cards:
  - Name, email
  - Permissions badges
  - Parent admin (if any)
- Add team member button
- Tap to manage permissions

**Business Admin Permissions**:
```kotlin
val BUSINESS_PERMISSIONS = listOf(
    Permission("sales_inquiries_view", "View Sales Inquiries", "View enterprise sales inquiry submissions."),
    Permission("sales_inquiries_manage", "Manage Sales Inquiries", "Assign, update status, and close sales inquiries."),
    Permission("sales_inquiries_contact", "Contact Prospects", "Send follow-up emails to sales leads."),
    Permission("business_team_view", "View Business Team", "View other business admins in the organization."),
    Permission("business_team_manage", "Manage Business Team", "Create and manage subordinate business admins."),
    Permission("enterprise_accounts", "Enterprise Accounts", "View and manage enterprise customer accounts."),
    Permission("sales_analytics", "Sales Analytics", "View sales pipeline metrics and conversion data."),
    Permission("contract_management", "Contract Management", "Create and manage enterprise contracts."),
    Permission("pricing_customization", "Custom Pricing", "Create custom pricing packages for enterprises."),
    Permission("partner_management", "Partner Management", "Manage business partners and affiliates."),
    Permission("revenue_reports", "Revenue Reports", "Access revenue and financial reports."),
    Permission("customer_success", "Customer Success", "Manage customer onboarding and success programs.")
)
```

**API Endpoints**:
```kotlin
GET /business/team - Team members
POST /api/business/team/add - Add team member
POST /api/business/team/{id}/permissions - Update permissions
POST /api/business/team/{id}/revoke - Revoke access
GET /api/business/users/search?q={query} - Search users to add
```

### 8.5 Pricing Management

**Purpose**: Manage subscription pricing tiers.

**UI Layout**:
- Pricing tiers list (sorted by display order):
  - Tier name
  - Price
  - Highlighted badge
  - Active/Inactive status
- Tap to edit
- FAB to create new tier

**Data Model**:
```kotlin
@Serializable
data class PricingTier(
    val id: Int,
    val tierId: String, // e.g., "free", "pro_buyer", "pro_seller", "elite_seller"
    val name: String,
    val price: Double,
    val priceDisplay: String,
    val tagline: String?,
    val features: List<String>,
    val isHighlighted: Boolean,
    val displayOrder: Int,
    val isActive: Boolean,
    val note: String?,
    val createdAt: String,
    val updatedAt: String?
)
```

**API Endpoints**:
```kotlin
GET /api/business/pricing - Get all tiers
GET /api/business/pricing/{tierId} - Get single tier
POST /api/business/pricing - Create tier
POST /api/business/pricing/{tierId} - Update tier
DELETE /api/business/pricing/{tierId} - Delete tier
```

### 8.6 Pricing Tier Editor

**UI Layout**:
- Form fields:
  - Tier ID (e.g., "pro_buyer")
  - Display name
  - Price input
  - Price display string
  - Tagline
  - Features list (add/remove chips)
  - Highlighted toggle
  - Display order
  - Active toggle
  - Admin note
- Preview card
- Save/Delete buttons

---

## Module 9: System Management (Global Admin Only)

### 9.1 Storage Explorer

**Purpose**: Browse and manage Azure Blob Storage.

**UI Layout**:
- Breadcrumb navigation
- Folder/file list:
  - Folder icon or file type icon
  - Name
  - Size (for files)
  - Last modified
- Upload FAB
- Tap folder to navigate
- Tap file for preview/actions

**File Actions**:
- Preview (images)
- Download
- Copy URL
- Delete

**API Endpoints**:
```kotlin
GET /admin/storage/blobs?prefix={prefix} - List blobs
GET /admin/storage/blobs/download?name={blobName} - Download
GET /admin/storage/blobs/preview?name={blobName} - Get SAS URL
POST /admin/storage/blobs/upload - Upload (multipart)
DELETE /admin/storage/blobs?name={blobName} - Delete
```

### 9.2 Database Explorer

**Purpose**: View and query database tables (read-only for most, write for Global Admin).

**UI Layout**:
- Tables list with row counts
- Tap table to view:
  - Schema info (columns, types)
  - Data viewer with pagination
  - Export CSV button
- Custom query input (SELECT only for non-global admins)

**Security**: 
- Read-only by default
- Write queries only for Global Admin
- Dangerous keywords blocked

**API Endpoints**:
```kotlin
GET /admin/database/tables - List tables
GET /admin/database/tables/{tableName}/schema - Get schema
GET /admin/database/tables/{tableName}/data?page={page}&limit={limit} - Get data
POST /admin/database/query - Execute SELECT query
GET /admin/database/tables/{tableName}/export - Export CSV
```

---

## UI/UX Design Guidelines

### Role-Based UI Adaptation

```kotlin
@Composable
fun AdminNavigationDrawer(
    userRole: AdminRole,
    currentDestination: String,
    onNavigate: (String) -> Unit
) {
    // Show/hide sections based on role
    NavigationDrawerItem(
        label = { Text("Dashboard") },
        selected = currentDestination == "admin/dashboard",
        onClick = { onNavigate("admin/dashboard") }
    )
    
    // User Management - All admins
    if (userRole.priority >= AdminRole.ADMIN.priority) {
        NavigationDrawerItem(
            label = { Text("User Management") },
            // ...
        )
    }
    
    // RBAC - Super Admin+
    if (userRole.priority >= AdminRole.SUPER_ADMIN.priority) {
        NavigationDrawerItem(
            label = { Text("RBAC Management") },
            // ...
        )
    }
    
    // System - Global Admin only
    if (userRole == AdminRole.GLOBAL_ADMIN) {
        NavigationDrawerItem(
            label = { Text("System") },
            // ...
        )
    }
}
```

### Color Coding

```kotlin
// Status colors
val statusColors = mapOf(
    "active" to Color(0xFF4CAF50),      // Green
    "pending" to Color(0xFFFFC107),     // Amber
    "suspended" to Color(0xFFFF9800),   // Orange
    "banned" to Color(0xFFF44336),      // Red
    "new" to Color(0xFF2196F3),         // Blue
    "under_review" to Color(0xFF9C27B0), // Purple
    "approved" to Color(0xFF4CAF50),    // Green
    "denied" to Color(0xFFF44336),      // Red
    "refunded" to Color(0xFF009688)     // Teal
)

// Priority colors
val priorityColors = mapOf(
    "low" to Color(0xFF9E9E9E),         // Gray
    "medium" to Color(0xFF2196F3),      // Blue
    "high" to Color(0xFFFF9800),        // Orange
    "urgent" to Color(0xFFF44336)       // Red
)

// Role colors
val roleColors = mapOf(
    "user" to Color(0xFF9E9E9E),
    "hr" to Color(0xFF9C27B0),
    "super_hr" to Color(0xFF7B1FA2),
    "global_hr" to Color(0xFF4A148C),
    "business_admin" to Color(0xFF00BCD4),
    "admin" to Color(0xFF2196F3),
    "super_admin" to Color(0xFF1565C0),
    "global_admin" to Color(0xFFFFD700)
)
```

### Confirmation Dialogs

```kotlin
@Composable
fun DestructiveActionDialog(
    title: String,
    message: String,
    confirmText: String = "Confirm",
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    requireReason: Boolean = false,
    onReasonChange: ((String) -> Unit)? = null
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(message)
                if (requireReason) {
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = "",
                        onValueChange = { onReasonChange?.invoke(it) },
                        label = { Text("Reason (required)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Text(confirmText)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
```

### Loading & Error States

```kotlin
@Composable
fun AdminLoadingState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(modifier = Modifier.height(16.dp))
            Text("Loading admin data...", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun AdminErrorState(
    message: String,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Error,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(message, style = MaterialTheme.typography.bodyLarge)
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}
```

---

## Data Layer Architecture

### Admin Repository

```kotlin
interface AdminRepository {
    // Dashboard
    suspend fun getStats(): Result<AdminStats>
    suspend fun getAuditLogs(page: Int, filters: AuditLogFilters): Result<List<AuditLog>>
    
    // User Management
    suspend fun getUsers(page: Int, search: String?, filters: UserFilters): Result<PaginatedResult<UserSummary>>
    suspend fun getUserDetail(userId: Int): Result<UserDetail>
    suspend fun getUserStats(userId: Int): Result<UserStats>
    suspend fun createUser(request: CreateUserRequest): Result<Int>
    suspend fun updateUserRole(userId: Int, role: String): Result<Unit>
    suspend fun updateUserPermissions(userId: Int, permissions: List<String>, scopes: List<String>): Result<Unit>
    suspend fun banUser(userId: Int, reason: String, notifyUser: Boolean): Result<Unit>
    suspend fun suspendUser(userId: Int, duration: String, reason: String, notifyUser: Boolean): Result<Unit>
    suspend fun unbanUser(userId: Int): Result<Unit>
    suspend fun getUserNotes(userId: Int): Result<List<AdminNote>>
    suspend fun addUserNote(userId: Int, note: String): Result<AdminNote>
    suspend fun freezeSellerPrivileges(userId: Int, reason: String): Result<Unit>
    suspend fun unfreezeSellerPrivileges(userId: Int): Result<Unit>
    suspend fun freezeChatPrivileges(userId: Int, reason: String): Result<Unit>
    suspend fun unfreezeChatPrivileges(userId: Int): Result<Unit>
    
    // Content Moderation
    suspend fun getServices(page: Int, status: String?, search: String?): Result<List<ServiceAdmin>>
    suspend fun hideService(serviceId: Int, notifyEmail: Boolean, notifyInApp: Boolean): Result<Unit>
    suspend fun unhideService(serviceId: Int, notifyEmail: Boolean, notifyInApp: Boolean): Result<Unit>
    suspend fun deleteService(serviceId: Int, reason: String?, notifyEmail: Boolean, notifyInApp: Boolean): Result<Unit>
    suspend fun hidePost(postId: Int): Result<Unit>
    suspend fun deletePost(postId: Int): Result<Unit>
    suspend fun hideComment(commentId: Int): Result<Unit>
    suspend fun deleteComment(commentId: Int): Result<Unit>
    suspend fun restoreComment(commentId: Int): Result<Unit>
    
    // Refunds & Appeals
    suspend fun getRefundRequests(page: Int, status: String?): Result<List<RefundRequest>>
    suspend fun getRefundDetail(requestId: Int): Result<RefundRequestDetail>
    suspend fun updateRefundRequest(requestId: Int, status: String, adminNotes: String?, refundAmount: Double?): Result<Unit>
    suspend fun getContentAppeals(page: Int, status: String?): Result<List<ContentAppeal>>
    suspend fun getAccountAppeals(page: Int, status: String?): Result<List<AccountAppeal>>
    suspend fun updateContentAppealStatus(appealId: Int, status: String): Result<Unit>
    suspend fun updateAccountAppealStatus(appealId: Int, status: String): Result<Unit>
    
    // Reports
    suspend fun getUserReports(page: Int, status: String?): Result<List<UserReport>>
    suspend fun updateReportStatus(reportId: Int, status: String, adminNotes: String?): Result<Unit>
    suspend fun lockUserBlocking(userId: Int, reason: String): Result<Unit>
    suspend fun unlockUserBlocking(userId: Int): Result<Unit>
}
```

### HR Repository

```kotlin
interface HrRepository {
    // Dashboard
    suspend fun getStats(): Result<HrStats>
    
    // Applications
    suspend fun getApplications(page: Int, status: String?): Result<List<CareerApplication>>
    suspend fun getApplicationDetail(applicationId: Int): Result<CareerApplication>
    suspend fun updateApplicationStatus(applicationId: Int, status: String): Result<Unit>
    suspend fun sendEmail(applicantId: Int, email: String, name: String, subject: String, message: String): Result<Unit>
    
    // Jobs
    suspend fun getJobs(): Result<List<CareerJob>>
    suspend fun getJobDetail(jobId: Int): Result<CareerJob>
    suspend fun createJob(job: CreateJobRequest): Result<CareerJob>
    suspend fun updateJob(jobId: Int, job: UpdateJobRequest): Result<CareerJob>
    suspend fun updateJobStatus(jobId: Int, status: String, freezeUntil: String?): Result<CareerJob>
    suspend fun deleteJobAsset(jobId: Int, assetId: Int): Result<Unit>
    
    // Team
    suspend fun getTeam(): Result<List<HrTeamMember>>
    suspend fun createHrAccount(request: CreateHrAccountRequest): Result<HrTeamMember>
    suspend fun updateMemberScopes(memberId: Int, scopes: List<String>, lock: Boolean?): Result<Unit>
    suspend fun updateMemberPermissions(memberId: Int, permissions: List<String>): Result<Unit>
}
```

### Business Repository

```kotlin
interface BusinessRepository {
    // Dashboard
    suspend fun getStats(): Result<SalesStats>
    
    // Sales Inquiries
    suspend fun getInquiries(page: Int, status: String?, priority: String?, assignedTo: Int?, search: String?): Result<PaginatedResult<SalesInquiry>>
    suspend fun getInquiryDetail(inquiryId: Int): Result<SalesInquiryDetail>
    suspend fun updateInquiryStatus(inquiryId: Int, status: String?, priority: String?, notes: String?): Result<Unit>
    suspend fun assignInquiry(inquiryId: Int, assignedTo: Int): Result<Unit>
    suspend fun closeInquiry(inquiryId: Int, outcome: String, notes: String?): Result<Unit>
    suspend fun sendFollowUpEmail(inquiryId: Int, subject: String, content: String): Result<Int>
    suspend fun addInquiryNote(inquiryId: Int, content: String): Result<Int>
    suspend fun getCommunications(inquiryId: Int): Result<List<InquiryCommunication>>
    
    // Team
    suspend fun getTeam(): Result<List<BusinessTeamMember>>
    suspend fun addTeamMember(userId: Int, permissions: List<String>, notes: String?): Result<Unit>
    suspend fun updateMemberPermissions(assignmentId: Int, permissions: List<String>): Result<Unit>
    suspend fun revokeMember(assignmentId: Int): Result<Unit>
    suspend fun searchUsers(query: String): Result<List<UserSearchResult>>
    
    // Pricing
    suspend fun getPricingTiers(includeInactive: Boolean): Result<List<PricingTier>>
    suspend fun getPricingTier(tierId: String): Result<PricingTier>
    suspend fun createPricingTier(tier: CreatePricingTierRequest): Result<Int>
    suspend fun updatePricingTier(tierId: String, tier: UpdatePricingTierRequest): Result<Unit>
    suspend fun deletePricingTier(tierId: String): Result<Unit>
}
```

---

## Security Considerations

### Role-Based Access Control

```kotlin
class AdminAuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        // Check if this is an admin endpoint
        val path = originalRequest.url.encodedPath
        val isAdminEndpoint = path.startsWith("/admin") || 
                              path.startsWith("/hr") || 
                              path.startsWith("/business") ||
                              path.startsWith("/rbac")
        
        if (!isAdminEndpoint) {
            return chain.proceed(originalRequest)
        }
        
        // Verify user has appropriate role
        val userRole = tokenManager.getCurrentUserRole()
        
        // Build request with auth token
        val token = tokenManager.getAccessToken()
        val authenticatedRequest = originalRequest.newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        
        return chain.proceed(authenticatedRequest)
    }
}
```

### Biometric Authentication for Sensitive Actions

```kotlin
@Composable
fun BiometricProtectedAction(
    actionDescription: String,
    onAuthenticated: () -> Unit,
    onCancelled: () -> Unit
) {
    val context = LocalContext.current
    val biometricManager = remember { BiometricManager.from(context) }
    
    val canAuthenticate = biometricManager.canAuthenticate(
        BiometricManager.Authenticators.BIOMETRIC_STRONG
    ) == BiometricManager.BIOMETRIC_SUCCESS
    
    if (canAuthenticate) {
        // Show biometric prompt
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Confirm Admin Action")
            .setSubtitle(actionDescription)
            .setNegativeButtonText("Cancel")
            .build()
        
        // Authenticate then call onAuthenticated
    } else {
        // Fallback to PIN/password
        onAuthenticated()
    }
}
```

### Sensitive Data Handling

```kotlin
// Redact sensitive data in logs
fun logAdminAction(action: String, details: Map<String, Any?>) {
    val redactedDetails = details.mapValues { (key, value) ->
        when {
            key.contains("password", ignoreCase = true) -> "[REDACTED]"
            key.contains("token", ignoreCase = true) -> "[REDACTED]"
            key.contains("secret", ignoreCase = true) -> "[REDACTED]"
            else -> value
        }
    }
    Log.d("AdminAction", "$action: $redactedDetails")
}
```

---

## Offline Considerations

### Caching Strategy

- **Dashboard stats**: Cache with 5-minute TTL
- **User lists**: Cache current page only
- **Pending actions**: Queue for sync when online
- **Audit logs**: Read-only, no caching required

### Pending Actions Queue

```kotlin
@Entity(tableName = "pending_admin_actions")
data class PendingAdminAction(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val actionType: String, // "update_status", "add_note", etc.
    val targetType: String, // "user", "refund", "appeal", etc.
    val targetId: Int,
    val payload: String, // JSON payload
    val createdAt: Long,
    val retryCount: Int = 0
)
```

---

## Testing Requirements

### Unit Tests
- ViewModel tests for each admin module
- Repository tests with mock API responses
- Permission checking logic
- Role hierarchy validation

### UI Tests
- Role-based navigation visibility
- Destructive action confirmations
- Form validation
- Error state handling

### Integration Tests
- Full admin workflows
- Bulk operations
- Real-time updates

---

## Project Structure

```
app/src/main/java/com/dreamx/app/
├── ui/
│   ├── admin/
│   │   ├── dashboard/
│   │   │   ├── AdminDashboardScreen.kt
│   │   │   └── AdminDashboardViewModel.kt
│   │   ├── users/
│   │   │   ├── UserManagementScreen.kt
│   │   │   ├── UserDetailScreen.kt
│   │   │   ├── CreateUserScreen.kt
│   │   │   └── UserManagementViewModel.kt
│   │   ├── moderation/
│   │   │   ├── ServiceModerationScreen.kt
│   │   │   ├── ContentModerationScreen.kt
│   │   │   └── ModerationViewModel.kt
│   │   ├── appeals/
│   │   │   ├── RefundRequestsScreen.kt
│   │   │   ├── AppealsScreen.kt
│   │   │   └── AppealsViewModel.kt
│   │   ├── reports/
│   │   │   ├── UserReportsScreen.kt
│   │   │   └── ReportsViewModel.kt
│   │   ├── audit/
│   │   │   ├── AuditLogsScreen.kt
│   │   │   └── AuditViewModel.kt
│   │   ├── rbac/
│   │   │   ├── RbacDashboardScreen.kt
│   │   │   ├── RoleManagementScreen.kt
│   │   │   ├── PermissionManagementScreen.kt
│   │   │   └── RbacViewModel.kt
│   │   └── system/
│   │       ├── StorageExplorerScreen.kt
│   │       ├── DatabaseExplorerScreen.kt
│   │       └── SystemViewModel.kt
│   ├── hr/
│   │   ├── dashboard/
│   │   │   ├── HrDashboardScreen.kt
│   │   │   └── HrDashboardViewModel.kt
│   │   ├── applications/
│   │   │   ├── ApplicationsScreen.kt
│   │   │   ├── ApplicationDetailScreen.kt
│   │   │   └── ApplicationsViewModel.kt
│   │   ├── jobs/
│   │   │   ├── JobPostingsScreen.kt
│   │   │   ├── JobDetailScreen.kt
│   │   │   ├── CreateEditJobScreen.kt
│   │   │   └── JobsViewModel.kt
│   │   ├── team/
│   │   │   ├── HrTeamScreen.kt
│   │   │   └── HrTeamViewModel.kt
│   │   └── outreach/
│   │       ├── OutreachScreen.kt
│   │       └── OutreachViewModel.kt
│   └── business/
│       ├── dashboard/
│       │   ├── BusinessDashboardScreen.kt
│       │   └── BusinessDashboardViewModel.kt
│       ├── sales/
│       │   ├── SalesInquiriesScreen.kt
│       │   ├── InquiryDetailScreen.kt
│       │   └── SalesViewModel.kt
│       ├── team/
│       │   ├── BusinessTeamScreen.kt
│       │   └── BusinessTeamViewModel.kt
│       └── pricing/
│           ├── PricingManagementScreen.kt
│           ├── PricingTierEditorScreen.kt
│           └── PricingViewModel.kt
├── data/
│   ├── repository/
│   │   ├── AdminRepository.kt
│   │   ├── AdminRepositoryImpl.kt
│   │   ├── HrRepository.kt
│   │   ├── HrRepositoryImpl.kt
│   │   ├── BusinessRepository.kt
│   │   └── BusinessRepositoryImpl.kt
│   └── api/
│       ├── AdminApi.kt
│       ├── HrApi.kt
│       └── BusinessApi.kt
└── domain/
    └── model/
        ├── AdminModels.kt
        ├── HrModels.kt
        └── BusinessModels.kt
```

---

## Delivery Milestones

### Phase 1: Foundation (Week 1-2)
- Admin navigation structure
- Role detection and routing
- Admin dashboard home
- Basic user management

### Phase 2: Admin Features (Week 3-4)
- Full user management with actions
- Content moderation screens
- Services moderation
- Audit logs viewer

### Phase 3: Appeals & Refunds (Week 5-6)
- Refund requests management
- Content appeals
- Account appeals
- User reports

### Phase 4: HR Module (Week 7-8)
- HR dashboard
- Career applications management
- Job postings CRUD
- HR team management

### Phase 5: Business Module (Week 9-10)
- Business dashboard
- Sales inquiries management
- Business team management
- Pricing management

### Phase 6: Advanced Features (Week 11-12)
- RBAC dashboard (Super Admin+)
- Database explorer (Global Admin)
- Storage explorer (Global Admin)
- Bulk operations

### Phase 7: Polish & Testing (Week 13-14)
- Biometric authentication
- Offline queue
- UI/UX refinements
- Testing

---

## Notes

1. **Role Detection**: On app startup, check the user's role from `/api/auth/me` response and conditionally show admin/HR/business navigation options.

2. **Permission Checks**: Always verify permissions before showing UI elements. The backend enforces permissions, but the mobile app should also hide unavailable actions.

3. **Real-time Updates**: Consider WebSocket/Socket.IO integration for real-time notifications about new refund requests, appeals, and sales inquiries.

4. **Deep Linking**: Support deep links like `dreamx://admin/users/123` for quick access from push notifications.

5. **Audit Trail**: Log all admin actions locally before sending to server for debugging purposes.

6. **Responsive Design**: Admin screens may have more complex layouts - consider tablet-specific layouts for better data density.

7. **Export Functionality**: For CSV exports, use Android's share sheet or save to Downloads folder.

8. **Session Security**: Consider shorter session timeouts for admin users and automatic logout on suspicious activity.

This prompt provides a comprehensive blueprint for building the admin, HR, and business management features of the Dream X Android application. Follow Material 3 guidelines, implement proper role-based access control, and ensure all destructive actions require confirmation.

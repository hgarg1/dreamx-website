# Livestreaming Infrastructure Summary

## What Was Implemented

This document provides a high-level overview of the video livestreaming infrastructure added to DreamX.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        DreamX Platform                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐         ┌──────────────┐                     │
│  │  Broadcaster │◄───────►│    Viewer    │                     │
│  │   (Sender)   │         │  (Receiver)  │                     │
│  └──────┬───────┘         └──────┬───────┘                     │
│         │                         │                              │
│         │ WebRTC Peer Connection │                              │
│         └─────────┬───────────────┘                              │
│                   │                                              │
│         ┌─────────▼──────────────────────┐                     │
│         │   Socket.IO Signaling Server   │                     │
│         │  (Offer/Answer/ICE Exchange)   │                     │
│         └─────────┬──────────────────────┘                     │
│                   │                                              │
│         ┌─────────▼──────────────────────┐                     │
│         │      WebRTC Service            │                     │
│         │  - Connection Management       │                     │
│         │  - ICE Server Config           │                     │
│         │  - Stream Tracking             │                     │
│         └─────────┬──────────────────────┘                     │
│                   │                                              │
│         ┌─────────▼──────────────────────┐                     │
│         │    Media Server Service        │                     │
│         │  - Recording                   │                     │
│         │  - Transcoding                 │                     │
│         │  - ABR Streaming               │                     │
│         └────────────────────────────────┘                     │
│                                                                  │
│         ┌────────────────────────────────┐                     │
│         │       Database Layer           │                     │
│         │  - livestreams                 │                     │
│         │  - livestream_viewers          │                     │
│         │  - livestream_chat             │                     │
│         └────────────────────────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Services Created

### 1. WebRTC Service (`services/livestream/webrtc.js`)

**Purpose:** Manages WebRTC peer connections for video streaming

**Key Features:**
- ICE server configuration (STUN/TURN)
- Peer connection creation and management
- Stream lifecycle (start, stop, join, leave)
- Viewer tracking
- Stream statistics

**Main Methods:**
- `createPeerConnection(streamId, userId)`
- `startBroadcast(userId, streamConfig)`
- `stopBroadcast(streamId)`
- `joinStream(streamId, userId)`
- `getActiveStreams()`
- `getStreamStats(streamId)`

### 2. Signaling Service (`services/livestream/signaling.js`)

**Purpose:** Handles WebRTC signaling using Socket.IO

**Key Features:**
- Real-time offer/answer exchange
- ICE candidate forwarding
- Room management for streams
- Broadcaster-viewer coordination
- Automatic cleanup on disconnect

**Socket Events Handled:**
- `stream:offer` - Broadcaster sends offer
- `stream:join` - Viewer joins stream
- `stream:answer` - Viewer responds with answer
- `stream:ice-candidate` - ICE candidate exchange
- `stream:end` - Stream ended

### 3. Media Server Service (`services/livestream/media-server.js`)

**Purpose:** Handles media processing and recording

**Key Features:**
- Stream recording (start/stop)
- Video transcoding (placeholder)
- Adaptive bitrate streaming (HLS/DASH)
- Recording archive management
- Quality variant generation

**Main Methods:**
- `startRecording(streamId, options)`
- `stopRecording(recordingId)`
- `transcodeVideo(inputPath, options)`
- `generateHLSManifest(videoId, variants)`
- `configureABR(streamConfig)`

## Database Schema

### livestreams Table

Stores all livestream metadata:

```sql
id                 - Unique identifier
user_id            - Broadcaster user ID
title              - Stream title
description        - Stream description
stream_key         - Unique authentication key
status             - scheduled | live | ended
started_at         - When stream went live
ended_at           - When stream ended
viewer_count_peak  - Maximum concurrent viewers
recording_enabled  - Whether to record
recording_url      - Saved recording location
thumbnail_url      - Stream thumbnail
created_at         - Creation timestamp
```

### livestream_viewers Table

Tracks viewer engagement:

```sql
id          - Unique identifier
stream_id   - Reference to livestream
user_id     - Viewer user ID (null for anonymous)
joined_at   - When viewer joined
left_at     - When viewer left (null if still watching)
```

### livestream_chat Table

Stores chat messages:

```sql
id          - Unique identifier
stream_id   - Reference to livestream
user_id     - Message sender
message     - Chat message content
created_at  - Message timestamp
```

## API Endpoints

### Stream Management

**Create Livestream**
```
POST /api/livestream/create
Body: { title, description, recordingEnabled }
Response: { streamId, streamKey }
```

**Get Active Streams**
```
GET /api/livestream/active?limit=50&offset=0
Response: { streams: [...] }
```

**Get User Streams**
```
GET /api/livestream/user/:userId
Response: { streams: [...] }
```

**Get Stream Details**
```
GET /api/livestream/:streamId
Response: { stream: {...} }
```

### Broadcasting

**Start Stream**
```
POST /api/livestream/:streamId/start
Response: { success: true }
```

**End Stream**
```
POST /api/livestream/:streamId/end
Body: { recordingUrl }
Response: { success: true }
```

### Viewing

**Join Stream**
```
POST /api/livestream/:streamId/join
Response: { success: true, iceServers: [...] }
```

**Leave Stream**
```
POST /api/livestream/:streamId/leave
Response: { success: true }
```

### Chat

**Get Chat History**
```
GET /api/livestream/:streamId/chat?limit=100&offset=0
Response: { messages: [...] }
```

**Send Chat Message**
```
POST /api/livestream/:streamId/chat
Body: { message }
Response: { success: true, messageId }
```

## Socket.IO Integration

The signaling service is initialized with the Socket.IO instance and handles all real-time communication:

```javascript
// In app.js
livestreamServices.signaling.initialize(io);

// Custom events for livestreaming
socket.on('join-livestream', (streamId) => { ... });
socket.on('leave-livestream', (streamId) => { ... });
```

## WebRTC Flow

### Broadcasting Flow

1. **Create Stream**: Call API to get stream ID and key
2. **Get Media**: Access camera/microphone via `getUserMedia()`
3. **Initialize WebRTC**: Create `RTCPeerConnection`
4. **Add Tracks**: Add media tracks to peer connection
5. **Start Stream**: Notify server stream is live
6. **Handle Viewers**: Create offer for each viewer joining
7. **Exchange ICE**: Share ICE candidates via signaling
8. **End Stream**: Stop tracks and notify server

### Viewing Flow

1. **Discover Streams**: Get active streams from API
2. **Join Stream**: Call join API endpoint
3. **Get ICE Servers**: Receive STUN/TURN configuration
4. **Initialize WebRTC**: Create `RTCPeerConnection`
5. **Wait for Offer**: Receive offer from broadcaster
6. **Create Answer**: Generate and send answer
7. **Exchange ICE**: Share ICE candidates
8. **Receive Stream**: Display incoming media tracks

## Integration Points

### Database Integration

All database operations use helper functions exported from `db.js`:
- Stream CRUD operations
- Viewer tracking
- Chat message persistence
- Analytics data collection

### Express Integration

API routes are integrated into the main Express app before error handlers:
- Stream management endpoints
- Viewer endpoints
- Chat endpoints
- All require authentication where appropriate

### Socket.IO Integration

Signaling service is initialized with the Socket.IO instance:
- Automatic room management
- Event forwarding between peers
- Connection cleanup on disconnect

## Configuration

### Environment Variables

Optional TURN server configuration:
```env
TURN_SERVER=turn:your-server.com:3478
TURN_USERNAME=your-username
TURN_PASSWORD=your-password
```

### Default ICE Servers

```javascript
{
  urls: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
  ]
}
```

## Next Steps for Implementation

1. **Frontend UI**
   - Create broadcaster interface
   - Create viewer interface
   - Implement chat UI
   - Add stream discovery page

2. **Media Handling**
   - Implement getUserMedia() calls
   - Handle browser permissions
   - Add error handling
   - Implement reconnection logic

3. **Production Setup**
   - Configure TURN servers
   - Set up CDN for recordings
   - Implement transcoding
   - Add monitoring/analytics

4. **Features**
   - Stream scheduling
   - Viewer limits
   - Monetization
   - Interactive elements

## Security Considerations

1. **Authentication**
   - Stream keys are unique and secret
   - API endpoints require user authentication
   - Viewers can be tracked (anonymous or logged in)

2. **Access Control**
   - Only broadcaster can start/end their stream
   - Viewer limits can be enforced
   - Chat can be moderated

3. **Rate Limiting**
   - Ready for implementation on chat
   - API endpoints can be rate-limited
   - Stream creation can be throttled

## Performance Optimization

1. **WebRTC**
   - Use TURN servers for NAT traversal
   - Implement quality adaptation
   - Monitor connection quality

2. **Database**
   - Indexed on stream_id, user_id, status
   - Efficient queries for active streams
   - Pagination on chat messages

3. **Scaling**
   - Use SFU for large audiences
   - Implement CDN for recordings
   - Cache active stream list

## Documentation

Complete documentation available in:
- `services/livestream/README.md` - Detailed service documentation
- Code comments in all service files
- API examples and usage guides

## Testing Checklist

- [x] Server starts successfully
- [x] Database tables created
- [x] API endpoints accessible
- [x] Socket.IO handlers registered
- [x] Services properly exported
- [ ] Frontend implementation (next step)
- [ ] End-to-end streaming test (requires frontend)
- [ ] Chat functionality test (requires frontend)
- [ ] Recording test (requires implementation)

## Support Resources

- WebRTC API: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- Socket.IO Docs: https://socket.io/docs/
- STUN/TURN Setup: https://webrtc.org/getting-started/turn-server
- MediaStream API: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream

---

**Status:** ✅ Infrastructure Complete - Ready for Frontend Implementation

# Livestream Services

This directory contains the infrastructure and services for video livestreaming functionality in DreamX.

## Overview

The livestreaming infrastructure supports both sending (broadcasting) and receiving (viewing) live video streams using WebRTC technology with Socket.IO signaling.

## Architecture

### Services

1. **WebRTC Service** (`webrtc.js`)
   - Manages peer-to-peer connections
   - Handles ICE servers (STUN/TURN)
   - Tracks active streams and viewers
   - Provides connection configuration

2. **Signaling Service** (`signaling.js`)
   - WebRTC signaling using Socket.IO
   - Manages offers, answers, and ICE candidates
   - Handles room management for streams
   - Coordinates broadcaster-viewer connections

3. **Media Server Service** (`media-server.js`)
   - Stream recording capabilities
   - Video transcoding (placeholder)
   - Adaptive bitrate streaming (HLS/DASH)
   - Archive management

## Database Schema

### Tables

**livestreams**
- Stores stream metadata (title, description, status)
- Unique stream keys for authentication
- Recording settings and URLs
- Peak viewer tracking

**livestream_viewers**
- Tracks viewer join/leave times
- Viewer count analytics
- User engagement metrics

**livestream_chat**
- Real-time chat messages during streams
- User identification
- Timestamp tracking

## API Endpoints

### Create Livestream
```
POST /api/livestream/create
Body: { title, description, recordingEnabled }
Response: { streamId, streamKey }
```

### Get Active Livestreams
```
GET /api/livestream/active?limit=50&offset=0
Response: { streams: [...] }
```

### Start Livestream
```
POST /api/livestream/:streamId/start
Response: { success: true }
```

### End Livestream
```
POST /api/livestream/:streamId/end
Body: { recordingUrl }
Response: { success: true }
```

### Join Stream (as Viewer)
```
POST /api/livestream/:streamId/join
Response: { success: true, iceServers: [...] }
```

### Leave Stream
```
POST /api/livestream/:streamId/leave
Response: { success: true }
```

### Chat Endpoints
```
GET /api/livestream/:streamId/chat
POST /api/livestream/:streamId/chat
Body: { message }
```

## Socket.IO Events

### Broadcaster Events

**Outgoing:**
- `stream:offer` - Send WebRTC offer
- `stream:offer:viewer` - Send offer to specific viewer
- `stream:ice-candidate` - Send ICE candidate
- `stream:end` - End the stream

**Incoming:**
- `stream:offer:ack` - Offer acknowledged
- `stream:viewer:joined` - New viewer joined
- `stream:viewer:left` - Viewer left
- `stream:answer:received` - Viewer's answer received
- `stream:ice-candidate:received` - ICE candidate from viewer

### Viewer Events

**Outgoing:**
- `stream:join` - Join a stream
- `stream:answer` - Send WebRTC answer
- `stream:ice-candidate` - Send ICE candidate
- `stream:leave` - Leave the stream

**Incoming:**
- `stream:join:ack` - Join acknowledged
- `stream:offer:received` - Broadcaster's offer
- `stream:ice-candidate:received` - ICE candidate from broadcaster
- `stream:ended` - Stream has ended
- `stream:error` - Error occurred

### Chat Events

**Outgoing:**
- `join-livestream` - Join livestream chat room
- `leave-livestream` - Leave livestream chat room

**Incoming:**
- `chat:message` - New chat message
  ```javascript
  { id, userId, message, timestamp }
  ```

## WebRTC Configuration

### ICE Servers

Default STUN servers:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

For production, configure TURN servers in `.env`:
```env
TURN_SERVER=turn:your-server.com:3478
TURN_USERNAME=your-username
TURN_PASSWORD=your-password
```

### Media Constraints

Recommended broadcaster constraints:
```javascript
{
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true
  }
}
```

## Implementation Guide

### Starting a Livestream

1. **Create Stream**
   ```javascript
   const response = await fetch('/api/livestream/create', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       title: 'My Stream',
       description: 'Stream description',
       recordingEnabled: true
     })
   });
   const { streamId, streamKey } = await response.json();
   ```

2. **Initialize WebRTC**
   ```javascript
   const socket = io();
   const peerConnection = new RTCPeerConnection({
     iceServers: [
       { urls: 'stun:stun.l.google.com:19302' }
     ]
   });
   ```

3. **Get Media Stream**
   ```javascript
   const stream = await navigator.mediaDevices.getUserMedia({
     video: true,
     audio: true
   });
   stream.getTracks().forEach(track => {
     peerConnection.addTrack(track, stream);
   });
   ```

4. **Handle Signaling**
   ```javascript
   // Send offer when viewer joins
   socket.on('stream:viewer:joined', async ({ viewerId }) => {
     const offer = await peerConnection.createOffer();
     await peerConnection.setLocalDescription(offer);
     socket.emit('stream:offer:viewer', { viewerId, offer });
   });
   
   // Handle ICE candidates
   peerConnection.onicecandidate = (event) => {
     if (event.candidate) {
       socket.emit('stream:ice-candidate', {
         streamId,
         candidate: event.candidate
       });
     }
   };
   ```

### Watching a Livestream

1. **Join Stream**
   ```javascript
   const response = await fetch(`/api/livestream/${streamId}/join`, {
     method: 'POST'
   });
   const { iceServers } = await response.json();
   ```

2. **Initialize Connection**
   ```javascript
   const peerConnection = new RTCPeerConnection({ iceServers });
   
   peerConnection.ontrack = (event) => {
     const videoElement = document.getElementById('stream-video');
     videoElement.srcObject = event.streams[0];
   };
   ```

3. **Handle Offer**
   ```javascript
   socket.on('stream:offer:received', async ({ offer }) => {
     await peerConnection.setRemoteDescription(offer);
     const answer = await peerConnection.createAnswer();
     await peerConnection.setLocalDescription(answer);
     socket.emit('stream:answer', { streamId, answer });
   });
   ```

## Recording

Streams can be recorded server-side or client-side:

### Server-Side Recording
- Enabled via `recordingEnabled` flag
- Stored in `/uploads/recordings/`
- Automatic transcoding to multiple qualities (placeholder)

### Client-Side Recording
```javascript
const mediaRecorder = new MediaRecorder(stream);
const chunks = [];

mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
mediaRecorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  // Upload or save blob
};

mediaRecorder.start();
// Later: mediaRecorder.stop();
```

## Adaptive Bitrate Streaming

The media server service includes placeholder support for ABR:
- Multiple quality variants (360p, 480p, 720p, 1080p)
- HLS manifest generation
- Automatic quality switching based on bandwidth

## Future Enhancements

- [ ] TURN server integration for better NAT traversal
- [ ] Cloud transcoding integration (AWS MediaConvert, etc.)
- [ ] CDN integration for stream distribution
- [ ] Advanced analytics and viewer insights
- [ ] Stream scheduling and notifications
- [ ] Interactive features (polls, Q&A)
- [ ] Monetization options (subscriptions, donations)

## Security Considerations

1. **Stream Key Protection**
   - Keep stream keys secret
   - Rotate keys after streams end
   - Validate keys before allowing broadcast

2. **Access Control**
   - Authenticate viewers before joining
   - Implement viewer limits
   - Rate limiting on chat messages

3. **Content Moderation**
   - Monitor live streams for violations
   - Quick stream termination capability
   - Chat moderation tools

## Performance Tips

1. **Optimize Video Settings**
   - Use 720p for most streams
   - Limit to 30 fps unless needed
   - Enable hardware acceleration

2. **Network Requirements**
   - Minimum 5 Mbps upload for broadcaster
   - Minimum 3 Mbps download for viewers
   - Use TURN servers for difficult networks

3. **Scaling**
   - Use SFU (Selective Forwarding Unit) for large audiences
   - Implement viewer limits per stream
   - Cache frequently accessed data

## Support

For implementation questions or issues, refer to:
- WebRTC documentation: https://webrtc.org
- Socket.IO documentation: https://socket.io
- MDN MediaStream API: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream

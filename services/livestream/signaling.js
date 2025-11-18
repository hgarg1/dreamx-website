/**
 * Signaling Service for WebRTC
 * 
 * Handles signaling messages between peers for WebRTC connection establishment.
 * Uses Socket.IO for real-time communication.
 * 
 * @module services/livestream/signaling
 */

class SignalingService {
    constructor() {
        this.io = null;
        this.rooms = new Map(); // Track stream rooms
    }

    /**
     * Initialize signaling service with Socket.IO instance
     * @param {Object} io - Socket.IO server instance
     */
    initialize(io) {
        this.io = io;
        this.setupSocketHandlers();
    }

    /**
     * Set up Socket.IO event handlers for signaling
     */
    setupSocketHandlers() {
        if (!this.io) return;

        this.io.on('connection', (socket) => {
            console.log(`Signaling: Client connected - ${socket.id}`);

            // Handle stream offer (broadcaster sends to server)
            socket.on('stream:offer', async (data) => {
                const { streamId, offer, userId } = data;
                
                // Join room for this stream
                socket.join(`stream_${streamId}`);
                
                // Store broadcaster info
                this.rooms.set(streamId, {
                    broadcasterId: socket.id,
                    userId,
                    viewers: new Set()
                });
                
                // Acknowledge offer received
                socket.emit('stream:offer:ack', { streamId, success: true });
            });

            // Handle viewer joining (viewer requests to watch)
            socket.on('stream:join', async (data) => {
                const { streamId, userId } = data;
                const room = this.rooms.get(streamId);
                
                if (!room) {
                    socket.emit('stream:error', { message: 'Stream not found' });
                    return;
                }
                
                // Add viewer to room
                socket.join(`stream_${streamId}`);
                room.viewers.add(socket.id);
                
                // Request offer from broadcaster for this viewer
                this.io.to(room.broadcasterId).emit('stream:viewer:joined', {
                    viewerId: socket.id,
                    userId
                });
                
                socket.emit('stream:join:ack', { streamId, success: true });
            });

            // Handle offer from broadcaster to specific viewer
            socket.on('stream:offer:viewer', async (data) => {
                const { viewerId, offer } = data;
                
                // Forward offer to viewer
                this.io.to(viewerId).emit('stream:offer:received', { offer });
            });

            // Handle answer from viewer
            socket.on('stream:answer', async (data) => {
                const { streamId, answer } = data;
                const room = this.rooms.get(streamId);
                
                if (!room) return;
                
                // Forward answer to broadcaster
                this.io.to(room.broadcasterId).emit('stream:answer:received', {
                    viewerId: socket.id,
                    answer
                });
            });

            // Handle ICE candidates
            socket.on('stream:ice-candidate', async (data) => {
                const { streamId, candidate, targetId } = data;
                
                // Forward ICE candidate to target peer
                if (targetId) {
                    this.io.to(targetId).emit('stream:ice-candidate:received', {
                        candidate,
                        fromId: socket.id
                    });
                } else {
                    // Broadcast to all in room if no specific target
                    socket.to(`stream_${streamId}`).emit('stream:ice-candidate:received', {
                        candidate,
                        fromId: socket.id
                    });
                }
            });

            // Handle stream end
            socket.on('stream:end', async (data) => {
                const { streamId } = data;
                
                // Notify all viewers
                socket.to(`stream_${streamId}`).emit('stream:ended', { streamId });
                
                // Clean up room
                this.rooms.delete(streamId);
                
                // Clear the room
                this.io.in(`stream_${streamId}`).socketsLeave(`stream_${streamId}`);
            });

            // Handle viewer leaving
            socket.on('stream:leave', async (data) => {
                const { streamId } = data;
                const room = this.rooms.get(streamId);
                
                if (room) {
                    room.viewers.delete(socket.id);
                    
                    // Notify broadcaster
                    this.io.to(room.broadcasterId).emit('stream:viewer:left', {
                        viewerId: socket.id
                    });
                }
                
                socket.leave(`stream_${streamId}`);
            });

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log(`Signaling: Client disconnected - ${socket.id}`);
                
                // Check if disconnected client was a broadcaster
                for (const [streamId, room] of this.rooms.entries()) {
                    if (room.broadcasterId === socket.id) {
                        // Broadcaster disconnected, end stream
                        this.io.to(`stream_${streamId}`).emit('stream:ended', { 
                            streamId, 
                            reason: 'broadcaster_disconnected' 
                        });
                        this.rooms.delete(streamId);
                    } else if (room.viewers.has(socket.id)) {
                        // Viewer disconnected
                        room.viewers.delete(socket.id);
                        this.io.to(room.broadcasterId).emit('stream:viewer:left', {
                            viewerId: socket.id
                        });
                    }
                }
            });
        });
    }

    /**
     * Get current room statistics
     * @returns {Array} List of active rooms with stats
     */
    getRoomStats() {
        return Array.from(this.rooms.entries()).map(([streamId, room]) => ({
            streamId,
            viewerCount: room.viewers.size,
            broadcasterId: room.broadcasterId
        }));
    }

    /**
     * Send custom message to stream room
     * @param {string} streamId - Stream identifier
     * @param {string} event - Event name
     * @param {Object} data - Data to send
     */
    sendToStream(streamId, event, data) {
        if (this.io) {
            this.io.to(`stream_${streamId}`).emit(event, data);
        }
    }
}

module.exports = new SignalingService();

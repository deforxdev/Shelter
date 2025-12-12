/**
 * WebRTCManager - Оптимізований менеджер для peer-to-peer відео/аудіо
 * Використовує MediaManager для локального потоку
 */
class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.peerConnections = {};
        this.pendingCandidates = {}; // Буфер для ICE кандидатів
        this.isCameraOn = false;
        this.isMicOn = false;
        this.supabaseClient = null;
        this.roomId = null;
        this.userId = null;
        this.signalingChannel = null;
        this.isConnecting = {};
        
        // Оптимізовані ICE сервери
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10 // Прискорення збору кандидатів
        };
        
        // Callbacks
        this.onRemoteStream = null;
        this.onPeerDisconnected = null;
    }
    
    /**
     * Ініціалізація WebRTC (паралельна)
     */
    async init(supabaseClient, roomId, userId) {
        console.time('WebRTC init');

        this.supabaseClient = supabaseClient;
        this.roomId = roomId;
        this.userId = userId;

        // Налаштувати signaling (камера запускається окремо)
        await this.setupSignaling();

        console.timeEnd('WebRTC init');
    }
    
    /**
     * Швидкий старт камери через MediaManager
     */
    async startCamera() {
        console.time('WebRTC startCamera');

        // Adaptive video constraints based on screen size
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        let videoConstraints;

        if (screenWidth <= 1400 || screenHeight <= 800) {
            // Smaller screens (13-14 inch laptops)
            videoConstraints = {
                width: { ideal: 240, max: 480 },
                height: { ideal: 180, max: 360 },
                frameRate: { ideal: 15, max: 20 }
            };
        } else {
            // Larger screens
            videoConstraints = {
                width: { ideal: 320, max: 640 },
                height: { ideal: 240, max: 480 },
                frameRate: { ideal: 20, max: 24 }
            };
        }

        try {
            // Використовуємо глобальний MediaManager якщо є
            if (window.mediaManager) {
                this.localStream = await window.mediaManager.init({
                    video: true,
                    audio: true,
                    videoConstraints: videoConstraints
                });
                
                this.isCameraOn = window.mediaManager.isVideoEnabled;
                this.isMicOn = window.mediaManager.isAudioEnabled;
            } else {
                // Fallback до прямого getUserMedia
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraints,
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true
                    }
                });
                this.isCameraOn = true;
                this.isMicOn = true;
            }
            
            // Вимкнути мікрофон за замовчуванням
            this.toggleMic(false);
            
            console.timeEnd('WebRTC startCamera');
            return this.localStream;
            
        } catch (error) {
            console.error('WebRTC: Camera error', error);
            console.timeEnd('WebRTC startCamera');
            
            // Спробувати тільки відео
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
                this.isCameraOn = true;
                this.isMicOn = false;
                return this.localStream;
            } catch (e) {
                console.error('WebRTC: Video-only failed', e);
                return null;
            }
        }
    }
    
    /**
     * Зупинити камеру
     */
    stopCamera() {
        if (window.mediaManager) {
            window.mediaManager.stop();
        } else if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        this.localStream = null;
        this.isCameraOn = false;
        this.isMicOn = false;
    }
    
    /**
     * Перемикання камери
     */
    toggleCamera(enabled) {
        if (window.mediaManager) {
            this.isCameraOn = window.mediaManager.toggleVideo(enabled);
        } else if (this.localStream) {
            const track = this.localStream.getVideoTracks()[0];
            if (track) {
                track.enabled = enabled;
                this.isCameraOn = enabled;
            }
        }
        return this.isCameraOn;
    }
    
    /**
     * Перемикання мікрофона
     */
    toggleMic(enabled) {
        if (window.mediaManager) {
            this.isMicOn = window.mediaManager.toggleAudio(enabled);
        } else if (this.localStream) {
            const track = this.localStream.getAudioTracks()[0];
            if (track) {
                track.enabled = enabled;
                this.isMicOn = enabled;
            }
        }
        return this.isMicOn;
    }
    
    /**
     * Налаштування signaling через Supabase Realtime
     */
    async setupSignaling() {
        return new Promise((resolve) => {
            this.signalingChannel = this.supabaseClient
                .channel(`webrtc-${this.roomId}`)
                .on('broadcast', { event: 'offer' }, async (payload) => {
                    if (payload.payload.target === this.userId) {
                        await this.handleOffer(payload.payload);
                    }
                })
                .on('broadcast', { event: 'answer' }, async (payload) => {
                    if (payload.payload.target === this.userId) {
                        await this.handleAnswer(payload.payload);
                    }
                })
                .on('broadcast', { event: 'ice-candidate' }, async (payload) => {
                    if (payload.payload.target === this.userId) {
                        await this.handleIceCandidate(payload.payload);
                    }
                })
                .subscribe((status) => {
                    console.log('WebRTC: Signaling status', status);
                    if (status === 'SUBSCRIBED') {
                        resolve();
                    }
                });
        });
    }
    
    /**
     * Створення peer connection з оптимізаціями
     */
    createPeerConnection(peerId) {
        if (this.peerConnections[peerId]) {
            return this.peerConnections[peerId];
        }
        
        const pc = new RTCPeerConnection(this.iceServers);
        this.pendingCandidates[peerId] = [];
        
        // Додати локальні треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Обробка ICE кандидатів (batching)
        let candidateBuffer = [];
        let sendTimeout = null;
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                candidateBuffer.push(event.candidate);
                
                // Відправляти пакетами кожні 100мс
                if (!sendTimeout) {
                    sendTimeout = setTimeout(() => {
                        if (candidateBuffer.length > 0) {
                            candidateBuffer.forEach(candidate => {
                                this.sendSignal('ice-candidate', {
                                    candidate: candidate,
                                    from: this.userId,
                                    target: peerId
                                });
                            });
                            candidateBuffer = [];
                        }
                        sendTimeout = null;
                    }, 100);
                }
            }
        };
        
        // Обробка віддаленого потоку
        pc.ontrack = (event) => {
            console.log('WebRTC: Remote track from', peerId);
            const remoteStream = event.streams[0];
            if (this.onRemoteStream) {
                this.onRemoteStream(peerId, remoteStream);
            }
        };
        
        // Обробка стану з'єднання
        pc.onconnectionstatechange = () => {
            console.log(`WebRTC: Connection ${peerId}:`, pc.connectionState);
            
            if (pc.connectionState === 'connected') {
                this.isConnecting[peerId] = false;
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.closePeerConnection(peerId);
                if (this.onPeerDisconnected) {
                    this.onPeerDisconnected(peerId);
                }
            }
        };
        
        this.peerConnections[peerId] = pc;
        return pc;
    }
    
    /**
     * Створити та відправити offer
     */
    async createOffer(peerId) {
        if (this.isConnecting[peerId]) {
            console.log('WebRTC: Already connecting to', peerId);
            return;
        }
        
        this.isConnecting[peerId] = true;
        const pc = this.createPeerConnection(peerId);
        
        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            this.sendSignal('offer', {
                offer: pc.localDescription,
                from: this.userId,
                target: peerId
            });
            
            console.log('WebRTC: Offer sent to', peerId);
        } catch (error) {
            console.error('WebRTC: Error creating offer', error);
            this.isConnecting[peerId] = false;
        }
    }
    
    /**
     * Обробка вхідного offer
     */
    async handleOffer(data) {
        const { offer, from } = data;
        console.log('WebRTC: Received offer from', from);
        
        let pc = this.peerConnections[from];
        if (!pc) {
            pc = this.createPeerConnection(from);
        }
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Додати буферизовані ICE кандидати
            const pending = this.pendingCandidates[from] || [];
            for (const candidate of pending) {
                await pc.addIceCandidate(candidate);
            }
            this.pendingCandidates[from] = [];
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.sendSignal('answer', {
                answer: pc.localDescription,
                from: this.userId,
                target: from
            });
            
            console.log('WebRTC: Answer sent to', from);
        } catch (error) {
            console.error('WebRTC: Error handling offer', error);
        }
    }
    
    /**
     * Обробка вхідного answer
     */
    async handleAnswer(data) {
        const { answer, from } = data;
        console.log('WebRTC: Received answer from', from);
        
        const pc = this.peerConnections[from];
        if (!pc) return;
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            
            // Додати буферизовані ICE кандидати
            const pending = this.pendingCandidates[from] || [];
            for (const candidate of pending) {
                await pc.addIceCandidate(candidate);
            }
            this.pendingCandidates[from] = [];
            
        } catch (error) {
            console.error('WebRTC: Error handling answer', error);
        }
    }
    
    /**
     * Обробка вхідного ICE candidate
     */
    async handleIceCandidate(data) {
        const { candidate, from } = data;
        const pc = this.peerConnections[from];
        
        if (!pc) {
            // Буферизувати якщо peer connection ще не готовий
            if (!this.pendingCandidates[from]) {
                this.pendingCandidates[from] = [];
            }
            this.pendingCandidates[from].push(new RTCIceCandidate(candidate));
            return;
        }
        
        try {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // Буферизувати якщо remote description ще не встановлений
                if (!this.pendingCandidates[from]) {
                    this.pendingCandidates[from] = [];
                }
                this.pendingCandidates[from].push(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('WebRTC: Error adding ICE candidate', error);
        }
    }
    
    /**
     * Відправка сигналу через Supabase
     */
    sendSignal(event, payload) {
        if (!this.signalingChannel) return;
        
        this.signalingChannel.send({
            type: 'broadcast',
            event: event,
            payload: payload
        });
    }
    
    /**
     * Підключитися до всіх гравців в кімнаті (паралельно)
     */
    async connectToPeers(players) {
        const connectPromises = [];
        
        for (const player of players) {
            if (player.id !== this.userId && !this.peerConnections[player.id]) {
                connectPromises.push(this.createOffer(player.id));
            }
        }
        
        await Promise.all(connectPromises);
    }
    
    /**
     * Закрити з'єднання з peer
     */
    closePeerConnection(peerId) {
        const pc = this.peerConnections[peerId];
        if (pc) {
            pc.close();
            delete this.peerConnections[peerId];
            delete this.pendingCandidates[peerId];
            delete this.isConnecting[peerId];
        }
    }
    
    /**
     * Закрити всі з'єднання
     */
    closeAllConnections() {
        Object.keys(this.peerConnections).forEach(peerId => {
            this.closePeerConnection(peerId);
        });
        
        this.stopCamera();
        
        if (this.signalingChannel) {
            this.supabaseClient.removeChannel(this.signalingChannel);
            this.signalingChannel = null;
        }
        
        console.log('WebRTC: All connections closed');
    }
}

// Export
window.WebRTCManager = WebRTCManager;

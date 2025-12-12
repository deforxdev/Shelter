/**
 * MediaManager - Швидкий менеджер камери та мікрофона
 * Оптимізований для швидкої ініціалізації
 */
class MediaManager {
    constructor() {
        this.localStream = null;
        this.videoTrack = null;
        this.audioTrack = null;
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.isInitialized = false;
        this.initPromise = null;
        
        // Callbacks
        this.onStreamReady = null;
        this.onError = null;
    }
    
    /**
     * Швидка ініціалізація медіа
     * Використовує паралельний запит та кешування
     */
    async init(options = {}) {
        // Якщо вже ініціалізовано - повернути існуючий потік
        if (this.isInitialized && this.localStream) {
            return this.localStream;
        }
        
        // Якщо ініціалізація в процесі - чекати
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this._initMedia(options);
        return this.initPromise;
    }
    
    async _initMedia(options) {
        const {
            video = true,
            audio = true,
            videoConstraints = null,
            audioConstraints = null
        } = options;
        
        // Оптимізовані constraints для швидкої ініціалізації
        const constraints = {
            video: video ? (videoConstraints || {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 24, max: 30 },
                facingMode: 'user'
            }) : false,
            audio: audio ? (audioConstraints || {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }) : false
        };
        
        try {
            console.time('MediaManager: getUserMedia');
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.timeEnd('MediaManager: getUserMedia');
            
            // Кешувати треки
            this.videoTrack = this.localStream.getVideoTracks()[0] || null;
            this.audioTrack = this.localStream.getAudioTracks()[0] || null;
            
            this.isInitialized = true;
            
            if (this.onStreamReady) {
                this.onStreamReady(this.localStream);
            }
            
            console.log('MediaManager: Initialized', {
                hasVideo: !!this.videoTrack,
                hasAudio: !!this.audioTrack
            });
            
            return this.localStream;
            
        } catch (error) {
            console.error('MediaManager: Primary init failed', error);
            
            // Fallback: спробувати тільки відео
            if (video && audio) {
                try {
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: constraints.video,
                        audio: false
                    });
                    this.videoTrack = this.localStream.getVideoTracks()[0] || null;
                    this.isInitialized = true;
                    console.log('MediaManager: Fallback to video-only');
                    return this.localStream;
                } catch (e) {
                    console.error('MediaManager: Video-only failed', e);
                }
            }
            
            // Fallback: спробувати тільки аудіо
            if (audio) {
                try {
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: false,
                        audio: constraints.audio
                    });
                    this.audioTrack = this.localStream.getAudioTracks()[0] || null;
                    this.isInitialized = true;
                    console.log('MediaManager: Fallback to audio-only');
                    return this.localStream;
                } catch (e) {
                    console.error('MediaManager: Audio-only failed', e);
                }
            }
            
            if (this.onError) {
                this.onError(error);
            }
            
            this.initPromise = null;
            return null;
        }
    }
    
    /**
     * Отримати потік (ініціалізувати якщо потрібно)
     */
    async getStream() {
        if (!this.isInitialized) {
            return this.init();
        }
        return this.localStream;
    }
    
    /**
     * Швидке вмикання/вимикання відео
     */
    toggleVideo(enabled = null) {
        if (this.videoTrack) {
            this.isVideoEnabled = enabled !== null ? enabled : !this.isVideoEnabled;
            this.videoTrack.enabled = this.isVideoEnabled;
            console.log('MediaManager: Video', this.isVideoEnabled ? 'ON' : 'OFF');
        }
        return this.isVideoEnabled;
    }
    
    /**
     * Швидке вмикання/вимикання аудіо
     */
    toggleAudio(enabled = null) {
        if (this.audioTrack) {
            this.isAudioEnabled = enabled !== null ? enabled : !this.isAudioEnabled;
            this.audioTrack.enabled = this.isAudioEnabled;
            console.log('MediaManager: Audio', this.isAudioEnabled ? 'ON' : 'OFF');
        }
        return this.isAudioEnabled;
    }
    
    /**
     * Прив'язати потік до video елемента
     */
    attachToVideo(videoElement, options = {}) {
        if (!videoElement || !this.localStream) return false;
        
        const { muted = true, mirror = true } = options;
        
        if (videoElement.srcObject !== this.localStream) {
            videoElement.srcObject = this.localStream;
            videoElement.muted = muted;
            
            if (mirror) {
                videoElement.style.transform = 'scaleX(-1)';
            }
            
            videoElement.play().catch(e => {
                console.warn('MediaManager: Autoplay blocked', e);
            });
        }
        
        return true;
    }
    
    /**
     * Відкріпити потік від video елемента
     */
    detachFromVideo(videoElement) {
        if (videoElement) {
            videoElement.srcObject = null;
        }
    }
    
    /**
     * Отримати інформацію про стан
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            hasVideo: !!this.videoTrack,
            hasAudio: !!this.audioTrack,
            videoEnabled: this.isVideoEnabled,
            audioEnabled: this.isAudioEnabled
        };
    }
    
    /**
     * Перезапустити камеру (якщо була помилка)
     */
    async restart() {
        this.stop();
        this.initPromise = null;
        return this.init();
    }
    
    /**
     * Зупинити всі потоки
     */
    stop() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
            });
            this.localStream = null;
        }
        
        this.videoTrack = null;
        this.audioTrack = null;
        this.isInitialized = false;
        this.initPromise = null;
        
        console.log('MediaManager: Stopped');
    }
    
    /**
     * Отримати список доступних пристроїв
     */
    static async getDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return {
                videoInputs: devices.filter(d => d.kind === 'videoinput'),
                audioInputs: devices.filter(d => d.kind === 'audioinput'),
                audioOutputs: devices.filter(d => d.kind === 'audiooutput')
            };
        } catch (e) {
            console.error('MediaManager: Failed to enumerate devices', e);
            return { videoInputs: [], audioInputs: [], audioOutputs: [] };
        }
    }
    
    /**
     * Перевірити чи є дозвіл на камеру/мікрофон
     */
    static async checkPermissions() {
        const result = { camera: 'unknown', microphone: 'unknown' };
        
        try {
            if (navigator.permissions) {
                const [cam, mic] = await Promise.all([
                    navigator.permissions.query({ name: 'camera' }).catch(() => null),
                    navigator.permissions.query({ name: 'microphone' }).catch(() => null)
                ]);
                
                if (cam) result.camera = cam.state;
                if (mic) result.microphone = mic.state;
            }
        } catch (e) {
            console.warn('MediaManager: Permissions API not supported');
        }
        
        return result;
    }
}

// Глобальний екземпляр
window.mediaManager = new MediaManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediaManager;
}

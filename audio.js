export class AudioHandler {
    constructor() {
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.isRecording = false;
        this.stream = null;
        this.audioElement = null;
    }

    initContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            this.floatData = new Float32Array(bufferLength);
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    async startMic() {
        try {
            this.initContext();
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.source = this.audioCtx.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);
            // Pull the audio graph so the analyser actually fills with data.
            // Use a silent gain so the user doesn't hear themselves (and to
            // avoid speaker -> microphone feedback).
            if (!this.micMonitor) {
                this.micMonitor = this.audioCtx.createGain();
                this.micMonitor.gain.value = 0;
                this.micMonitor.connect(this.audioCtx.destination);
            }
            this.analyser.connect(this.micMonitor);
            this.isRecording = true;
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            return false;
        }
    }

    stopMic() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
        }
        if (this.source) {
            this.source.disconnect();
        }
        if (this.analyser && this.micMonitor) {
            this.analyser.disconnect(this.micMonitor);
        }
    }

    async loadMediaFile(file, isVideo = false) {
        this.initContext();
        const url = URL.createObjectURL(file);
        
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
            // Remove old video element if it exists in DOM
            if (this.audioElement.tagName === 'VIDEO') {
                this.audioElement.remove();
            }
        }

        if (isVideo) {
            this.audioElement = document.createElement('video');
            this.audioElement.style.display = 'none';
            this.audioElement.muted = false;
            this.audioElement.playsInline = true;
            document.body.appendChild(this.audioElement);
        } else {
            this.audioElement = new Audio();
        }

        this.audioElement.src = url;
        
        // Reconnect source
        if (this.mediaSource) {
            this.mediaSource.disconnect();
        }
        this.mediaSource = this.audioCtx.createMediaElementSource(this.audioElement);
        this.mediaSource.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
        
        return new Promise((resolve) => {
            if (isVideo) {
                this.audioElement.onloadeddata = () => resolve(this.audioElement);
            } else {
                this.audioElement.oncanplaythrough = () => resolve(this.audioElement);
            }
        });
    }

    play() {
        if (this.audioElement) {
            this.audioElement.play();
        }
    }

    restart() {
        if (this.audioElement) {
            this.audioElement.currentTime = 0;
            this.audioElement.play();
        }
    }

    getAudioData() {
        if (!this.analyser) return { average: 0, frequencies: [] };
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        
        return {
            average: average,
            frequencies: Array.from(this.dataArray),
            // Cached analyser + context so the renderer can do formant analysis
            analyser: this.analyser,
            sampleRate: this.audioCtx ? this.audioCtx.sampleRate : 44100,
            floatData: this.floatData
        };
    }
}
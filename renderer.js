export class Renderer {
    constructor(canvas, vizCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.vizCanvas = vizCanvas;
        this.vizCtx = vizCanvas.getContext('2d');
        
this.mouthSets = {
    happy: {
        closed: 'mouth0009.png',
        cks:    'mouth0007.png',
        fv:     'mouth0008.png',
        o:      'mouth0021.png',
        u:      'mouth0011.png',
        e:      'mouth0002.png',
        a:      'mouth0005.png',                                                            
        i:      'mouth0001.png',
        ex:     'mouth0007.png'
    },
    sad: {
        closed: 'mouth0020.png',
        cks:    'mouth0018.png',
        fv:     'mouth0019.png',
        o:      'mouth0021.png',
        u:      'mouth0011.png',
        e:      'mouth0013.png',
        a:      'mouth0016.png',
        i:      'mouth0014.png',
        ex:     'mouth0018.png'
    }
};

        this.loadedSets = {};
        this.currentSetName = 'happy';
        this.smoothAvg = 0;
        this.lastViseme = 'closed';
        this.holdFrames = 0;

        // Preload all assets
        for (const [name, set] of Object.entries(this.mouthSets)) {
            this.loadedSets[name] = {};
            for (const [viseme, src] of Object.entries(set)) {
                this.loadedSets[name][viseme] = this.loadMouth(src);
            }
        }
        this.characterPos = { x: 0, y: 0 };
        this.characterScale = 1;
        this.bgVideo = null;
    }

    loadMouth(src) {
        const img = new Image();
        img.src = src;
        const container = { img, ready: false };
        img.onload = () => {
            container.ready = true;
        };
        return container;
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        this.vizCanvas.width = this.vizCanvas.parentElement.clientWidth;
        this.vizCanvas.height = this.vizCanvas.parentElement.clientHeight;

        this.characterPos = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2
        };
        this.characterScale = Math.min(this.canvas.width, this.canvas.height) * 0.7;
    }

    setMouthSet(setName) {
        if (this.mouthSets[setName]) {
            this.currentSetName = setName;
        }
    }

    setVideoBackground(videoElement) {
        this.bgVideo = videoElement;
    }

    // Convert byte-value + bin index into an estimated frequency in Hz.
    _binHz(bin, sampleRate, fftSize) {
        return bin * (sampleRate / fftSize);
    }

    // Find the frequency bin with the strongest energy in [lo,hi] Hz.
    _dominantHz(frequencies, sampleRate, fftSize, lo, hi) {
        const binHz = sampleRate / fftSize;
        const loBin = Math.max(1, Math.floor(lo / binHz));
        const hiBin = Math.min(frequencies.length - 1, Math.ceil(hi / binHz));
        let bestBin = loBin, bestVal = -1;
        for (let i = loBin; i <= hiBin; i++) {
            if (frequencies[i] > bestVal) { bestVal = frequencies[i]; bestBin = i; }
        }
        return this._binHz(bestBin, sampleRate, fftSize);
    }

    // Average byte energy over a frequency band.
    _bandEnergy(frequencies, sampleRate, fftSize, lo, hi) {
        const binHz = sampleRate / fftSize;
        const loBin = Math.max(1, Math.floor(lo / binHz));
        const hiBin = Math.min(frequencies.length - 1, Math.ceil(hi / binHz));
        let sum = 0, n = 0;
        for (let i = loBin; i <= hiBin; i++) { sum += frequencies[i]; n++; }
        return n ? sum / n : 0;
    }

    // Spectral centroid over a frequency range (the "center of mass" of the
    // spectrum). Vowels sit low (~a few hundred Hz); fricatives jump up high,
    // so this clearly separates them.
    _centroidHz(frequencies, sampleRate, fftSize, lo = 0, hi = Infinity) {
        const binHz = sampleRate / fftSize;
        const loBin = Math.max(1, Math.floor(lo / binHz));
        const hiBin = Math.min(frequencies.length - 1, Math.ceil(hi / binHz));
        let num = 0, den = 0;
        for (let i = loBin; i <= hiBin; i++) {
            const hz = i * binHz;
            num += frequencies[i] * hz;
            den += frequencies[i];
        }
        return den ? num / den : 0;
    }

    // Classify the current audio frame into a viseme: closed / cks / f / a / e / i / o / u / ex
    _classifyPhoneme(audioData) {
        const rawAvg = audioData.average;
        // Silence: nothing spoken.
        if (rawAvg < 4) return 'closed';

        const sampleRate = audioData.sampleRate || 44100;
        const fftSize = 2048;
        const freqs = audioData.frequencies;

        // Voicing: low-freq energy (the fundamental/first formant of voiced sounds).
        const voicedE = this._bandEnergy(freqs, sampleRate, fftSize, 60, 600);
        const fricE = this._bandEnergy(freqs, sampleRate, fftSize, 3000, 9000);

        // A fricative is gain-invariantly loud up high and quiet down low:
        // the high band dominates the low band by a large *ratio* (here in
        // linear energy, ~2x or more), no fixed amplitude threshold needed.
        // Vowels, even faint ones, keep their low energy so this stays safe.
        if (fricE > 0 && fricE / Math.max(voicedE, 1) > 0.9) {
            const peakHz = this._dominantHz(freqs, sampleRate, fftSize, 2500, 9500);
            return peakHz < 7200 ? 'fv' : 'cks';
        }

        // Vowel / voiced: read the two formants as frequencies, not band sums.
        const f1 = this._dominantHz(freqs, sampleRate, fftSize, 250, 1000);
        const f2 = this._dominantHz(freqs, sampleRate, fftSize, 900, 3200);

        // Open vowel (a): high F1.  Check it FIRST so "a" can't fall into o/u.
        if (f1 > 500) return 'a';
        // Rounded back vowels (o/u): low F1 AND low F2.
        if (f2 < 1500) {
            return f1 < 400 ? 'u' : 'o';
        }
        // Close front vowel (i): very high F2.
        if (f2 > 2200) return 'i';
        // Otherwise mid front (e).
        return 'e';
    }

    determineMouth(audioData, visualOpenness = 0) {
        // Audio spectrum classification (works for mic, audio files, and video).
        let viseme = this._classifyPhoneme(audioData);

        // Video lip-tracking is the fallback when there's no audio classification at all.
        if (viseme === 'closed' && visualOpenness > 0.35) {
            viseme = this.lastViseme === 'closed' ? 'a' : this.lastViseme;
        }

        // Amplitude decides "very loud" vs mid-vowel.
        this.smoothAvg += (audioData.average - this.smoothAvg) * 0.5;
        const loud = this.smoothAvg > 85 && viseme !== 'closed';

        // Keep the previous viseme briefly so quick sounds don't flicker to silence.
        if (viseme === 'closed' && this.lastViseme !== 'closed' && this.holdFrames < 2) {
            this.holdFrames++;
            viseme = this.lastViseme;
        } else {
            this.holdFrames = 0;
        }

        this.lastViseme = (loud && ['a', 'i', 'e'].includes(viseme)) ? 'ex' : viseme;
    }

    render(audioData, visualOpenness = 0) {
        this.determineMouth(audioData, visualOpenness);
        this.drawMain(audioData);
        this.drawViz(audioData);
    }

    drawMain(audioData) {
        const { ctx, canvas, characterPos, characterScale } = this;
        
        // Always draw green background for chroma key usage
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (this.bgVideo) {
            // Draw video as a small reference in top left corner
            const v = this.bgVideo;
            const vRatio = v.videoWidth / v.videoHeight;
            const pipWidth = canvas.width * 0.25; // 25% of screen width
            const pipHeight = pipWidth / vRatio;
            
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, 10, pipWidth, pipHeight);
            ctx.drawImage(v, 10, 10, pipWidth, pipHeight);
            ctx.restore();
        }

        const avg = audioData.average;
        const jitter = (avg * 0.15); 

        ctx.save();
        ctx.translate(characterPos.x, characterPos.y + jitter);
        
        const currentSet = this.loadedSets[this.currentSetName];
        const mouthObj = currentSet ? currentSet[this.lastViseme || 'closed'] : null;
        
        if (mouthObj && mouthObj.ready) {
            const mW = characterScale * 0.7;
            const aspectRatio = mouthObj.img.naturalHeight / mouthObj.img.naturalWidth;
            const mH = mW * aspectRatio;
            ctx.drawImage(mouthObj.img, -mW/2, -mH/2, mW, mH);
        }

        ctx.restore();
    }

    drawViz(audioData) {
        const { vizCtx, vizCanvas } = this;
        const width = vizCanvas.width;
        const height = vizCanvas.height;
        
        vizCtx.clearRect(0, 0, width, height);
        
        if (!audioData.frequencies.length) return;

        const barWidth = width / audioData.frequencies.length;
        vizCtx.fillStyle = 'rgba(76, 175, 80, 0.5)';

        for (let i = 0; i < audioData.frequencies.length; i++) {
            const val = audioData.frequencies[i];
            const barHeight = (val / 255) * height;
            vizCtx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
        }
    }
}

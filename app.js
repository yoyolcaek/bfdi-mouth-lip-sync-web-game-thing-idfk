import { AudioHandler } from './audio.js';
import { Renderer } from './renderer.js';
import { VisionHandler } from './vision.js';

let audioHandler;
let renderer;
let visionHandler;

export async function init() {
    const canvas = document.getElementById('mainCanvas');
    const vizCanvas = document.getElementById('vizCanvas');
    const recordBtn = document.getElementById('recordBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadVideoBtn = document.getElementById('uploadVideoBtn');
    const restartBtn = document.getElementById('restartBtn');
    const audioUpload = document.getElementById('audioUpload');
    const videoUpload = document.getElementById('videoUpload');
    const recordText = document.getElementById('recordText');
    const status = document.getElementById('status');
    const uiLayer = document.getElementById('ui-layer');
    const toggleHint = document.getElementById('toggle-ui-hint');
    const tabBtns = document.querySelectorAll('.tab-btn');

    renderer = new Renderer(canvas, vizCanvas);
    audioHandler = new AudioHandler();
    visionHandler = new VisionHandler();

    // Start rendering loop
    function loop() {
        const audioData = audioHandler.getAudioData();
        let visualOpenness = 0;
        
        if (renderer.bgVideo) {
            visualOpenness = visionHandler.processVideoFrame(renderer.bgVideo);
        }
        
        renderer.render(audioData, visualOpenness);
        requestAnimationFrame(loop);
    }
    loop();

    recordBtn.addEventListener('click', async () => {
        if (!audioHandler.isRecording) {
            const success = await audioHandler.startMic();
            if (success) {
                recordBtn.classList.add('recording');
                recordText.textContent = 'Stop Recording';
                status.textContent = 'Listening to microphone...';
            }
        } else {
            audioHandler.stopMic();
            recordBtn.classList.remove('recording');
            recordText.textContent = 'Record Voice';
            status.textContent = 'Microphone stopped.';
        }
    });

    uploadBtn.addEventListener('click', () => {
        audioUpload.click();
    });

    uploadVideoBtn.addEventListener('click', () => {
        videoUpload.click();
    });

    restartBtn.addEventListener('click', () => {
        audioHandler.restart();
        status.textContent = "Media restarted.";
    });

    const toggleUI = () => {
        uiLayer.classList.toggle('hidden-ui');
    };

    toggleHint.addEventListener('click', toggleUI);
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h') toggleUI();
    });

    const appElement = document.getElementById('app');
    const indicator = document.getElementById('active-indicator');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const setName = btn.dataset.set;
            renderer.setMouthSet(setName);
            
            // Visual feedback for separation
            appElement.className = `mode-${setName}`;
            indicator.textContent = `${setName.charAt(0).toUpperCase() + setName.slice(1)} Mode`;
            status.textContent = `${setName.charAt(0).toUpperCase() + setName.slice(1)} set active.`;
        });
    });

    audioUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            renderer.setVideoBackground(null);
            status.textContent = `Loading ${file.name}...`;
            const success = await audioHandler.loadMediaFile(file, false);
            if (success) {
                status.textContent = `Playing ${file.name}`;
                audioHandler.play();
            }
        }
    });

    videoUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            status.textContent = `Initializing AI Vision...`;
            await visionHandler.init();
            
            status.textContent = `Loading video: ${file.name}...`;
            const videoElement = await audioHandler.loadMediaFile(file, true);
            if (videoElement) {
                renderer.setVideoBackground(videoElement);
                status.textContent = `Syncing BFDI mouth to visual lip movements: ${file.name}`;
                audioHandler.play();
            }
        }
    });

    // Handle resizing
    window.addEventListener('resize', () => renderer.resize());
    renderer.resize();
}
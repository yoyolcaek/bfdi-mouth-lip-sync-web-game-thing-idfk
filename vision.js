import { FaceLandmarker, FilesetResolver } from "https://esm.sh/@mediapipe/tasks-vision@0.10.3";

export class VisionHandler {
    constructor() {
        this.faceLandmarker = null;
        this.isOpennessReady = false;
        this.currentOpenness = 0;
        this.isLoading = false;
    }

    async init() {
        if (this.isLoading || this.faceLandmarker) return;
        this.isLoading = true;
        try {
            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
            );
            this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
            this.isOpennessReady = true;
            console.log("Vision Handler Initialized");
        } catch (error) {
            console.error("Error initializing Vision Handler:", error);
        } finally {
            this.isLoading = false;
        }
    }

    processVideoFrame(videoElement) {
        if (!this.faceLandmarker || !videoElement || videoElement.paused || videoElement.ended) {
            return 0;
        }

        const startTimeMs = performance.now();
        const results = this.faceLandmarker.detectForVideo(videoElement, startTimeMs);

        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
            // JawOpen is index 25 in MediaPipe Face Blendshapes
            // Alternatively, we can find it by name
            const blendshapes = results.faceBlendshapes[0].categories;
            const jawOpen = blendshapes.find(shape => shape.categoryName === "jawOpen")?.score || 0;
            const mouthClose = blendshapes.find(shape => shape.categoryName === "mouthClose")?.score || 0;
            const mouthPucker = blendshapes.find(shape => shape.categoryName === "mouthPucker")?.score || 0;
            
            // Basic openness logic: jawOpen is the primary driver
            // We scale it a bit to make it more responsive to BFDI mouth shapes
            this.currentOpenness = Math.max(0, (jawOpen * 1.5) - (mouthClose * 0.5));
            return this.currentOpenness;
        }

        return 0;
    }

    getOpenness() {
        return this.currentOpenness;
    }
}
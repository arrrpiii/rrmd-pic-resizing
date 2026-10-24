// A classic worker is required by MediaPipe's WASM loader (importScripts).
const vision = import('./vendor/mediapipe/vision_bundle.mjs');
let detector;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, FaceLandmarker, HandLandmarker } = await vision;
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', self.location.href).href);
      const face = data.kind === 'earrings';
      const options = {
        baseOptions: { modelAssetPath: face
          ? 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
          : 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO',
        ...(face ? { numFaces: 2, minFaceDetectionConfidence: .65, minFacePresenceConfidence: .65, minTrackingConfidence: .65 }
          : { numHands: 2, minHandDetectionConfidence: .65, minHandPresenceConfidence: .65, minTrackingConfidence: .65 }),
      };
      detector = await (face ? FaceLandmarker : HandLandmarker).createFromOptions(files, options);
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  } else if (data.type === 'frame') {
    try {
      const result = detector.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'result', points: result.faceLandmarks || result.landmarks || [], timestamp: data.timestamp });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
    finally { data.bitmap.close(); }
  }
};

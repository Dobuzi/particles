import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type ShapePoint = {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  timestamp: number;
};

type HandState = {
  status: 'idle' | 'ready' | 'tracking' | 'denied' | 'error';
  message: string;
  isDrawing: boolean;
  points: ShapePoint[];
};

const MAX_POINTS = 400;
const MIN_POINT_DISTANCE = 0.04;
const PINCH_DISTANCE = 0.04;
const FRAME_SKIP = 3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function useHandDrawing({
  enabled,
  volume,
}: {
  enabled: boolean;
  volume: number;
}) {
  const [state, setState] = useState<HandState>({
    status: 'idle',
    message: 'Show your hand to the camera',
    isDrawing: false,
    points: [],
  });
  const shapeRef = useRef<ShapePoint[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      shapeRef.current = [];
      setState((prev) => ({
        ...prev,
        isDrawing: false,
        points: [],
        message: 'Gesture drawing is off',
      }));
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
      return;
    }

    let mounted = true;
    let frameCount = 0;

    const setup = async () => {
      try {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        videoRef.current = video;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 360 },
          audio: false,
        });
        streamRef.current = stream;
        video.srcObject = stream;

        await video.play();

        const fileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        landmarkerRef.current = landmarker;

        setState((prev) => ({
          ...prev,
          status: 'ready',
          message: 'Show your hand to the camera',
        }));

        const tick = () => {
          if (!mounted || !landmarkerRef.current || !videoRef.current) return;
          frameCount += 1;
          if (frameCount % FRAME_SKIP === 0) {
            const now = performance.now();
            const result = landmarkerRef.current.detectForVideo(
              videoRef.current,
              now
            );

            if (!result.landmarks || result.landmarks.length === 0) {
              setState((prev) => ({
                ...prev,
                status: 'ready',
                message: 'Show your hand to the camera',
                isDrawing: false,
              }));
            } else {
              const landmarks = result.landmarks[0];
              const indexTip = landmarks[8];
              const thumbTip = landmarks[4];
              const wrist = landmarks[0];
              const middleMcp = landmarks[9];

              const pinchDistance = Math.hypot(
                indexTip.x - thumbTip.x,
                indexTip.y - thumbTip.y,
                (indexTip.z || 0) - (thumbTip.z || 0)
              );

              const handSpan = Math.hypot(
                wrist.x - middleMcp.x,
                wrist.y - middleMcp.y,
                (wrist.z || 0) - (middleMcp.z || 0)
              );

              // Map hand scale to a pseudo-depth so closer hands push the stroke forward.
              const depth = Math.max(0, Math.min(1, 0.4 / Math.max(handSpan, 0.05)));
              const target = {
                x: (indexTip.x - 0.5) * 2 * volume,
                y: (0.5 - indexTip.y) * 2 * volume,
                z: (depth - 0.5) * 2 * volume,
              };

              const last = shapeRef.current[shapeRef.current.length - 1];
              const smooth = last
                ? {
                    x: lerp(last.x, target.x, 0.35),
                    y: lerp(last.y, target.y, 0.35),
                    z: lerp(last.z, target.z, 0.35),
                  }
                : target;

              const isPinched = pinchDistance < PINCH_DISTANCE;
              if (isPinched) {
                if (
                  !last ||
                  Math.hypot(
                    smooth.x - last.x,
                    smooth.y - last.y,
                    smooth.z - last.z
                  ) > MIN_POINT_DISTANCE
                ) {
                  const prev =
                    shapeRef.current[shapeRef.current.length - 2] || smooth;
                  // Approximate local tangent for alignment behavior.
                  const tangent = {
                    x: smooth.x - prev.x,
                    y: smooth.y - prev.y,
                    z: smooth.z - prev.z,
                  };
                  const mag = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
                  const point = {
                    x: smooth.x,
                    y: smooth.y,
                    z: smooth.z,
                    tx: tangent.x / mag,
                    ty: tangent.y / mag,
                    tz: tangent.z / mag,
                    timestamp: performance.now(),
                  };
                  shapeRef.current = [...shapeRef.current, point].slice(-MAX_POINTS);
                  setState((prevState) => ({
                    ...prevState,
                    isDrawing: true,
                    status: 'tracking',
                    message: 'Pinch to draw',
                    points: shapeRef.current,
                  }));
                } else {
                  setState((prevState) => ({
                    ...prevState,
                    isDrawing: true,
                    status: 'tracking',
                    message: 'Pinch to draw',
                    points: shapeRef.current,
                  }));
                }
              } else {
                setState((prev) => ({
                  ...prev,
                  isDrawing: false,
                  status: 'tracking',
                  message: 'Pinch to draw',
                  points: shapeRef.current,
                }));
              }
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (error) {
        if (!mounted) return;
        setState((prev) => ({
          ...prev,
          status: 'denied',
          message: 'Camera access denied',
        }));
        console.error(error);
      }
    };

    setup();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    };
  }, [enabled, volume]);

  const clearShape = useCallback(() => {
    shapeRef.current = [];
    setState((prev) => ({
      ...prev,
      points: [],
    }));
  }, []);

  return {
    shapeRef,
    state,
    clearShape,
  };
}

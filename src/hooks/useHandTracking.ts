// Simplified hand tracking hook using MediaPipe
// Focused on tracking only - no gesture drawing
// Uses refs for high-frequency data to avoid React state overhead

import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Vec3, HandInfo, Handedness } from '../types';
import { vec3Lerp } from '../utils/math';

const FRAME_SKIP = 2; // Process every N frames
const SMOOTHING_ALPHA = 0.4;

const LANDMARK_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17],                               // Palm
];

export type HandTrackingState = {
  status: 'loading' | 'ready' | 'tracking' | 'denied' | 'error';
  hasHand: boolean;
  hasTwoHands: boolean;
  fps: number | null;
};

export function useHandTracking({
  enabled,
  previewRef,
  previewEnabled,
}: {
  enabled: boolean;
  previewRef: React.MutableRefObject<HTMLCanvasElement | null>;
  previewEnabled: boolean;
}) {
  // Use state only for UI-relevant status (low frequency)
  const [state, setState] = useState<HandTrackingState>({
    status: 'loading',
    hasHand: false,
    hasTwoHands: false,
    fps: null,
  });

  // Use refs for high-frequency hand data
  const handsRef = useRef<HandInfo[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);

  // Smoothed landmarks for stability
  const smoothedLeftRef = useRef<Vec3[] | null>(null);
  const smoothedRightRef = useRef<Vec3[] | null>(null);

  const smoothLandmarks = useCallback(
    (current: Vec3[], previous: Vec3[] | null): Vec3[] => {
      if (!previous) return current;
      return current.map((lm, i) => vec3Lerp(previous[i], lm, SMOOTHING_ALPHA));
    },
    []
  );

  const drawPreview = useCallback(
    (left?: Vec3[], right?: Vec3[]) => {
      if (!previewEnabled) return;
      const canvas = previewRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const drawHand = (landmarks: Vec3[] | undefined, stroke: string, fill: string) => {
        if (!landmarks) return;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [start, end] of LANDMARK_CONNECTIONS) {
          const a = landmarks[start];
          const b = landmarks[end];
          ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
          ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
        }
        ctx.stroke();

        ctx.fillStyle = fill;
        for (const point of landmarks) {
          ctx.beginPath();
          ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // Unified warm neutral colors for preview
      drawHand(left, 'rgba(212, 184, 150, 0.8)', 'rgba(232, 226, 218, 0.9)');
      drawHand(right, 'rgba(200, 176, 148, 0.8)', 'rgba(232, 226, 218, 0.9)');
    },
    [previewEnabled, previewRef]
  );

  useEffect(() => {
    if (!enabled) {
      handsRef.current = [];
      setState({
        status: 'ready',
        hasHand: false,
        hasTwoHands: false,
        fps: null,
      });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
      return;
    }

    let mounted = true;

    const setup = async () => {
      try {
        setState((s) => ({ ...s, status: 'loading' }));

        // Create video element
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        videoRef.current = video;

        // Get camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        // Initialize MediaPipe
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
          numHands: 2,
        });
        landmarkerRef.current = landmarker;

        if (!mounted) return;
        setState((s) => ({ ...s, status: 'ready' }));

        // Main tracking loop
        const tick = () => {
          if (!mounted || !landmarkerRef.current || !videoRef.current) return;

          frameCountRef.current += 1;
          if (frameCountRef.current % FRAME_SKIP !== 0) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          const now = performance.now();
          let result;
          try {
            result = landmarkerRef.current.detectForVideo(videoRef.current, now);
          } catch {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          // Calculate FPS
          if (lastFrameRef.current) {
            const delta = now - lastFrameRef.current;
            const fps = delta > 0 ? 1000 / delta : 0;
            setState((s) => ({
              ...s,
              fps: s.fps ? s.fps * 0.8 + fps * 0.2 : fps,
            }));
          }
          lastFrameRef.current = now;

          const landmarksList = result.landmarks || [];
          const handednessList = result.handednesses || [];

          let leftLandmarks: Vec3[] | null = null;
          let rightLandmarks: Vec3[] | null = null;

          for (let i = 0; i < landmarksList.length; i++) {
            const landmarks = landmarksList[i] as Vec3[];
            const handednessInfo = handednessList[i]?.[0];
            const label: Handedness =
              handednessInfo?.categoryName === 'Left'
                ? 'Left'
                : handednessInfo?.categoryName === 'Right'
                ? 'Right'
                : 'Unknown';

            if (label === 'Left' && !leftLandmarks) {
              leftLandmarks = landmarks;
            } else if (label === 'Right' && !rightLandmarks) {
              rightLandmarks = landmarks;
            } else if (!leftLandmarks) {
              leftLandmarks = landmarks;
            } else if (!rightLandmarks) {
              rightLandmarks = landmarks;
            }
          }

          // Apply smoothing
          const smoothedLeft = leftLandmarks
            ? smoothLandmarks(leftLandmarks, smoothedLeftRef.current)
            : null;
          const smoothedRight = rightLandmarks
            ? smoothLandmarks(rightLandmarks, smoothedRightRef.current)
            : null;

          smoothedLeftRef.current = smoothedLeft;
          smoothedRightRef.current = smoothedRight;

          // Update hands ref (no React state!)
          const hands: HandInfo[] = [];
          if (smoothedLeft) {
            hands.push({ handedness: 'Left', landmarks: smoothedLeft });
          }
          if (smoothedRight) {
            hands.push({ handedness: 'Right', landmarks: smoothedRight });
          }
          handsRef.current = hands;

          // Update UI state (debounced by frame skip)
          const hasHand = hands.length > 0;
          const hasTwoHands = hands.length >= 2;
          setState((s) => {
            if (s.hasHand !== hasHand || s.hasTwoHands !== hasTwoHands) {
              return { ...s, status: 'tracking', hasHand, hasTwoHands };
            }
            return s;
          });

          // Draw preview
          drawPreview(smoothedLeft || undefined, smoothedRight || undefined);

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (error) {
        if (!mounted) return;
        console.error('Hand tracking error:', error);
        setState((s) => ({ ...s, status: 'denied' }));
      }
    };

    setup();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
    };
  }, [enabled, drawPreview, smoothLandmarks]);

  return {
    state,
    handsRef,
  };
}

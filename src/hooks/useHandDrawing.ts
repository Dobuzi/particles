import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { ShapePoint, HandInfo, HandState, HandTargetCloud } from '../types';
import { lerp } from '../utils/math';
import {
  HAND_DRAWING_FRAME_SKIP,
  PINCH_DISTANCE,
  MIN_POINT_DISTANCE,
  MAX_SHAPE_POINTS,
  LANDMARK_CONNECTIONS,
  HAND_CHAINS,
  SMOOTHING_ALPHA,
} from '../constants';

const smoothLandmarks = (
  previous: Array<{ x: number; y: number; z: number }> | null,
  current: Array<{ x: number; y: number; z: number }>,
  alpha: number
) =>
  current.map((point, idx) => {
    if (!previous) return point;
    const prev = previous[idx] || point;
    return {
      x: lerp(prev.x, point.x, alpha),
      y: lerp(prev.y, point.y, alpha),
      z: lerp(prev.z, point.z, alpha),
    };
  });

const resampleSegment = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  steps: number
) => {
  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / (steps + 1);
    points.push({
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
    });
  }
  return points;
};

export function useHandDrawing({
  enabled,
  volume,
  previewRef,
  previewEnabled,
}: {
  enabled: boolean;
  volume: number;
  previewRef: React.MutableRefObject<HTMLCanvasElement | null>;
  previewEnabled: boolean;
}) {
  const [state, setState] = useState<HandState>({
    status: 'loading',
    message: 'Show your hand to the camera',
    isDrawing: false,
    points: [],
    hasHand: false,
    hasTwoHands: false,
    fps: null,
    hands: [],
  });
  const shapeRef = useRef<ShapePoint[]>([]);
  const handTargetsRef = useRef<HandTargetCloud>({ data: new Float32Array(0), count: 0 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const previousHandsRef = useRef<{
    left: Array<{ x: number; y: number; z: number }> | null;
    right: Array<{ x: number; y: number; z: number }> | null;
    leftWrist: { x: number; y: number; z: number } | null;
    rightWrist: { x: number; y: number; z: number } | null;
  }>({ left: null, right: null, leftWrist: null, rightWrist: null });

  useEffect(() => {
    if (!enabled) {
      shapeRef.current = [];
      handTargetsRef.current = { data: new Float32Array(0), count: 0 };
      setState((prev) => ({
        ...prev,
        isDrawing: false,
        points: [],
        hasHand: false,
        hasTwoHands: false,
        hands: [],
        fps: null,
        status: 'ready',
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
        setState((prev) => ({ ...prev, status: 'loading', message: 'Loading hand tracker' }));
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
          numHands: 2,
        });
        landmarkerRef.current = landmarker;

        setState((prev) => ({
          ...prev,
          status: 'ready',
          message: 'Show your hands to the camera',
        }));

        const drawPreview = (
          left?: Array<{ x: number; y: number; z: number }>,
          right?: Array<{ x: number; y: number; z: number }>
        ) => {
          if (!previewEnabled) return;
          const canvas = previewRef.current;
          const videoEl = videoRef.current;
          if (!canvas || !videoEl) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

          const drawHand = (
            landmarks: Array<{ x: number; y: number; z: number }> | undefined,
            stroke: string,
            fill: string
          ) => {
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

          drawHand(left, 'rgba(120, 240, 255, 0.9)', 'rgba(255, 255, 255, 0.95)');
          drawHand(right, 'rgba(255, 177, 119, 0.9)', 'rgba(255, 240, 210, 0.95)');
        };

        const buildHandTargets = (
          landmarks: Array<{ x: number; y: number; z: number }>,
          depth: number,
          handId: number
        ) => {
          const points: Array<{ x: number; y: number; z: number; handId: number }> = [];
          const depthOffset = (depth - 0.5) * 2 * volume;
          const depthScale = volume * 0.6;
          const toWorld = (p: { x: number; y: number; z: number }) => ({
            x: (p.x - 0.5) * 2 * volume,
            y: (0.5 - p.y) * 2 * volume,
            z: depthOffset + (p.z || 0) * depthScale,
            handId,
          });

          landmarks.forEach((p) => points.push(toWorld(p)));

          for (const chain of HAND_CHAINS) {
            for (let i = 0; i < chain.length - 1; i += 1) {
              const a = landmarks[chain[i]];
              const b = landmarks[chain[i + 1]];
              resampleSegment(a, b, 6).forEach((p) => points.push(toWorld(p)));
            }
          }

          return points;
        };

        const tick = () => {
          if (!mounted || !landmarkerRef.current || !videoRef.current) return;
          frameCount += 1;
          if (frameCount % HAND_DRAWING_FRAME_SKIP === 0) {
            const now = performance.now();
            let result;
            try {
              result = landmarkerRef.current.detectForVideo(
                videoRef.current,
                now
              );
            } catch (error) {
              setState((prev) => ({
                ...prev,
                status: 'error',
                message: 'Hand tracking error',
              }));
              console.error(error);
              rafRef.current = requestAnimationFrame(tick);
              return;
            }

            if (lastFrameRef.current) {
              const delta = now - lastFrameRef.current;
              const fps = delta > 0 ? 1000 / delta : 0;
              setState((prev) => ({
                ...prev,
                fps: prev.fps ? prev.fps * 0.8 + fps * 0.2 : fps,
              }));
            }
            lastFrameRef.current = now;

            const landmarksList = result.landmarks || [];
            const handednessList = result.handednesses || [];
            const detectedHands: HandInfo[] = [];

            let leftLandmarks: Array<{ x: number; y: number; z: number }> | null = null;
            let rightLandmarks: Array<{ x: number; y: number; z: number }> | null = null;

            for (let i = 0; i < landmarksList.length; i += 1) {
              const landmarks = landmarksList[i];
              const handednessInfo = handednessList[i]?.[0];
              const label = handednessInfo?.categoryName === 'Left'
                ? 'Left'
                : handednessInfo?.categoryName === 'Right'
                ? 'Right'
                : 'Unknown';
              const confidence = handednessInfo?.score;

              const wrist = landmarks[0];
              if (label === 'Left') {
                leftLandmarks = landmarks;
              } else if (label === 'Right') {
                rightLandmarks = landmarks;
              } else if (!leftLandmarks || !rightLandmarks) {
                const prevLeft = previousHandsRef.current.leftWrist;
                const prevRight = previousHandsRef.current.rightWrist;
                if (prevLeft && prevRight) {
                  const distLeft = Math.hypot(
                    wrist.x - prevLeft.x,
                    wrist.y - prevLeft.y,
                    (wrist.z || 0) - prevLeft.z
                  );
                  const distRight = Math.hypot(
                    wrist.x - prevRight.x,
                    wrist.y - prevRight.y,
                    (wrist.z || 0) - prevRight.z
                  );
                  if (distLeft <= distRight && !leftLandmarks) leftLandmarks = landmarks;
                  else if (!rightLandmarks) rightLandmarks = landmarks;
                } else if (!leftLandmarks) {
                  leftLandmarks = landmarks;
                } else {
                  rightLandmarks = landmarks;
                }
              }

              detectedHands.push({
                handedness: label,
                landmarks,
                confidence,
              });
            }

            const leftSmoothed = leftLandmarks
              ? smoothLandmarks(previousHandsRef.current.left, leftLandmarks, SMOOTHING_ALPHA)
              : null;
            const rightSmoothed = rightLandmarks
              ? smoothLandmarks(previousHandsRef.current.right, rightLandmarks, SMOOTHING_ALPHA)
              : null;

            previousHandsRef.current.left = leftSmoothed;
            previousHandsRef.current.right = rightSmoothed;
            previousHandsRef.current.leftWrist = leftSmoothed ? leftSmoothed[0] : null;
            previousHandsRef.current.rightWrist = rightSmoothed ? rightSmoothed[0] : null;

            const hands: HandInfo[] = [];
            if (leftSmoothed) {
              hands.push({ handedness: 'Left', landmarks: leftSmoothed });
            }
            if (rightSmoothed) {
              hands.push({ handedness: 'Right', landmarks: rightSmoothed });
            }

            if (hands.length === 0) {
              handTargetsRef.current = { data: new Float32Array(0), count: 0 };
              setState((prev) => ({
                ...prev,
                status: 'ready',
                message: 'Show your hands to the camera',
                isDrawing: false,
                hasHand: false,
                hasTwoHands: false,
                hands: [],
              }));
              drawPreview();
            } else {
              const targets: Array<{ x: number; y: number; z: number; handId: number }> = [];
              hands.forEach((hand, idx) => {
                const wrist = hand.landmarks[0];
                const middleMcp = hand.landmarks[9];
                const handSpan = Math.hypot(
                  wrist.x - middleMcp.x,
                  wrist.y - middleMcp.y,
                  (wrist.z || 0) - (middleMcp.z || 0)
                );
                const depth = Math.max(0, Math.min(1, 0.4 / Math.max(handSpan, 0.05)));
                const handTargets = buildHandTargets(hand.landmarks, depth, idx);
                targets.push(...handTargets);
              });

              const targetArray = new Float32Array(targets.length * 4);
              targets.forEach((point, index) => {
                const base = index * 4;
                targetArray[base] = point.x;
                targetArray[base + 1] = point.y;
                targetArray[base + 2] = point.z;
                targetArray[base + 3] = point.handId;
              });
              handTargetsRef.current = { data: targetArray, count: targets.length };

              const activeHand = hands[0];
              const indexTip = activeHand.landmarks[8];
              const thumbTip = activeHand.landmarks[4];
              const wrist = activeHand.landmarks[0];
              const middleMcp = activeHand.landmarks[9];

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
                  shapeRef.current = [...shapeRef.current, point].slice(-MAX_SHAPE_POINTS);
                  setState((prevState) => ({
                    ...prevState,
                    isDrawing: true,
                    status: 'tracking',
                    message: 'Pinch to draw',
                    points: shapeRef.current,
                    hasHand: true,
                    hasTwoHands: hands.length > 1,
                    hands,
                  }));
                } else {
                  setState((prevState) => ({
                    ...prevState,
                    isDrawing: true,
                    status: 'tracking',
                    message: 'Pinch to draw',
                    points: shapeRef.current,
                    hasHand: true,
                    hasTwoHands: hands.length > 1,
                    hands,
                  }));
                }
              } else {
                setState((prev) => ({
                  ...prev,
                  isDrawing: false,
                  status: 'tracking',
                  message: 'Pinch to draw',
                  points: shapeRef.current,
                  hasHand: true,
                  hasTwoHands: hands.length > 1,
                  hands,
                }));
              }

              drawPreview(leftSmoothed || undefined, rightSmoothed || undefined);
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (error) {
        if (!mounted) return;
        console.error('Hand drawing setup error:', error);
        const isDenied =
          error instanceof DOMException &&
          (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
        setState((prev) => ({
          ...prev,
          status: isDenied ? 'denied' : 'error',
          message: isDenied
            ? 'Camera access denied'
            : error instanceof Error
            ? `Setup failed: ${error.message}`
            : 'Hand tracking setup failed',
        }));
      }
    };

    setup();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    };
  }, [enabled, volume, previewEnabled, previewRef]);

  const clearShape = useCallback(() => {
    shapeRef.current = [];
    setState((prev) => ({
      ...prev,
      points: [],
    }));
  }, []);

  return {
    shapeRef,
    handTargetsRef,
    state,
    clearShape,
  };
}

// Hand Particle Visualization App
// PRIMARY: Hand-form particles along skeleton
// SECONDARY: Thin streams between matching fingertips

import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { HandParticleSystem } from './components/HandParticleSystem';
import { useHandTracking } from './hooks/useHandTracking';

// Particle count: 50-150 total, default 100
const DEFAULT_TOTAL_PARTICLES = 100;

export default function FingertipStreamApp() {
  const [totalParticles, setTotalParticles] = useState(DEFAULT_TOTAL_PARTICLES);
  const [handStreamBalance, setHandStreamBalance] = useState(0.3); // 0 = all hands, 1 = more streams
  const [streamIntensity, setStreamIntensity] = useState(0.7);
  const [showStreams, setShowStreams] = useState(true);
  const [flowStrength, setFlowStrength] = useState(0.8);
  const [noiseStrength, setNoiseStrength] = useState(0.6);
  const [colorIntensity, setColorIntensity] = useState(0.9);
  const [paused, setPaused] = useState(false);
  const [background, setBackground] = useState<'dark' | 'light'>('dark');
  const [showPreview, setShowPreview] = useState(true);

  // Advanced tuning parameters
  const [depthExaggeration, setDepthExaggeration] = useState(1.0);
  const [spacingStiffness, setSpacingStiffness] = useState(0.6);
  const [streamResponsiveness, setStreamResponsiveness] = useState(1.0);
  const [glowIntensity, setGlowIntensity] = useState(0.5);
  const [particleSize, setParticleSize] = useState(0.4);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hand tracking hook
  const { state, handsRef } = useHandTracking({
    enabled: true,
    previewRef: previewCanvasRef,
    previewEnabled: showPreview,
  });

  useEffect(() => {
    document.body.classList.toggle('light', background === 'light');
  }, [background]);

  return (
    <div className={`app ${background}`}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={[background === 'dark' ? '#0a0b12' : '#f6f4ef']} />
        <ambientLight intensity={0.4} />
        <HandParticleSystem
          handsRef={handsRef}
          totalParticles={totalParticles}
          handStreamBalance={handStreamBalance}
          streamIntensity={streamIntensity}
          showStreams={showStreams}
          flowStrength={flowStrength}
          noiseStrength={noiseStrength}
          colorIntensity={colorIntensity}
          paused={paused}
          depthExaggeration={depthExaggeration}
          spacingStiffness={spacingStiffness}
          streamResponsiveness={streamResponsiveness}
          glowIntensity={glowIntensity}
          particleSize={particleSize}
        />
      </Canvas>

      <div className="hud">
        <div className="title">Hand Particles</div>
        <div className="status">
          {state.status === 'loading'
            ? 'Initializing hand tracking...'
            : state.status === 'denied'
            ? 'Camera access denied'
            : state.status === 'error'
            ? 'Camera error'
            : state.hasTwoHands
            ? 'Two hands detected'
            : state.hasHand
            ? 'One hand detected'
            : 'Show hands to camera'}
        </div>
        <div className="status subtle">
          Particles: {totalParticles} | FPS: {state.fps?.toFixed(0) ?? '—'}
        </div>
      </div>

      <div className="panel">
        <div className="panel-section">
          <div className="panel-title">Particles</div>
          <label>
            Count: {totalParticles}
            <input
              type="range"
              min="50"
              max="150"
              step="10"
              value={totalParticles}
              onChange={(e) => setTotalParticles(Number(e.target.value))}
            />
          </label>
          <label>
            Size: {particleSize.toFixed(2)}
            <input
              type="range"
              min="0.15"
              max="0.8"
              step="0.05"
              value={particleSize}
              onChange={(e) => setParticleSize(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="panel-section">
          <div className="panel-title">Composition</div>
          <label>
            Hand ↔ Stream: {Math.round((1 - handStreamBalance) * 100)}% / {Math.round(handStreamBalance * 100)}%
            <input
              type="range"
              min="0"
              max="0.7"
              step="0.05"
              value={handStreamBalance}
              onChange={(e) => setHandStreamBalance(Number(e.target.value))}
            />
          </label>
          <label>
            Stream Intensity
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={streamIntensity}
              onChange={(e) => setStreamIntensity(Number(e.target.value))}
            />
          </label>
          <div className="pill-row">
            <button
              className={showStreams ? 'pill active' : 'pill'}
              onClick={() => setShowStreams((s) => !s)}
            >
              {showStreams ? 'Streams On' : 'Streams Off'}
            </button>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-title">Motion</div>
          <label>
            Flow
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={flowStrength}
              onChange={(e) => setFlowStrength(Number(e.target.value))}
            />
          </label>
          <label>
            Noise
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={noiseStrength}
              onChange={(e) => setNoiseStrength(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="panel-section">
          <div className="panel-title">Tuning</div>
          <label>
            Depth: {depthExaggeration.toFixed(1)}
            <input
              type="range"
              min="0.3"
              max="1.5"
              step="0.1"
              value={depthExaggeration}
              onChange={(e) => setDepthExaggeration(Number(e.target.value))}
            />
          </label>
          <label>
            Spacing: {spacingStiffness.toFixed(1)}
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.1"
              value={spacingStiffness}
              onChange={(e) => setSpacingStiffness(Number(e.target.value))}
            />
          </label>
          <label>
            Responsiveness: {streamResponsiveness.toFixed(1)}
            <input
              type="range"
              min="0.3"
              max="2.0"
              step="0.1"
              value={streamResponsiveness}
              onChange={(e) => setStreamResponsiveness(Number(e.target.value))}
            />
          </label>
          <label>
            Color: {colorIntensity.toFixed(1)}
            <input
              type="range"
              min="0.3"
              max="1.2"
              step="0.1"
              value={colorIntensity}
              onChange={(e) => setColorIntensity(Number(e.target.value))}
            />
          </label>
          <label>
            Glow: {glowIntensity.toFixed(1)}
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.1"
              value={glowIntensity}
              onChange={(e) => setGlowIntensity(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="panel-section">
          <div className="panel-title">Playback</div>
          <div className="pill-row">
            <button className="pill" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="pill"
              onClick={() => setBackground((b) => (b === 'dark' ? 'light' : 'dark'))}
            >
              {background === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="pill" onClick={() => setShowPreview((p) => !p)}>
              {showPreview ? 'Hide Cam' : 'Show Cam'}
            </button>
          </div>
        </div>
      </div>

      <div className={`preview ${showPreview ? 'show' : 'hide'}`}>
        <div className="preview-inner">
          <canvas ref={previewCanvasRef} width={240} height={135} />
          <div className="preview-label">
            <span
              className={
                state.status === 'denied'
                  ? 'status-dot denied'
                  : state.hasHand
                  ? 'status-dot active'
                  : 'status-dot idle'
              }
            />
            {state.status === 'denied'
              ? 'Camera blocked'
              : state.status === 'loading'
              ? 'Loading tracker'
              : state.hasTwoHands
              ? `2 hands · ${state.fps?.toFixed(0) ?? '—'} FPS`
              : state.hasHand
              ? `1 hand · ${state.fps?.toFixed(0) ?? '—'} FPS`
              : 'No hand'}
          </div>
        </div>
      </div>
    </div>
  );
}

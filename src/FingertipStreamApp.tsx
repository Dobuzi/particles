// Hand Particle Visualization App
// PRIMARY: Hand-form particles along skeleton
// SECONDARY: Thin streams between matching fingertips

import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState, useCallback } from 'react';
import { HandParticleSystem } from './components/HandParticleSystem';
import { ClayParticleSystem } from './components/ClayParticleSystem';
import { HandConnectionLines, ClayConnectionLines } from './components/ConnectionLines';
import { useHandTracking } from './hooks/useHandTracking';
import type { ClaySimulation } from './simulation/ClaySimulation';

// Mobile detection and performance
const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
const getMobileDPR = () => isMobile() ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;

// Mode preset settings bundle
// See docs/art-direction-modes.md for design rationale
type ModePreset = {
  name: string;
  description: string;
  settings: {
    totalParticles: number;
    handStreamBalance: number;
    streamIntensity: number;
    showStreams: boolean;
    showLinks: boolean;
    flowStrength: number;
    noiseStrength: number;
    colorIntensity: number;
    depthExaggeration: number;
    spacingStiffness: number;
    streamResponsiveness: number;
    glowIntensity: number;
    particleSize: number;
    showClay: boolean;
    clayParticles: number;
    clayRadius: number;
    sculptStrength: number;
    showHandLines: boolean;
    showClayLines: boolean;
    // Clay jitter (organic life)
    clayJitterAmplitude: number;
    clayJitterSpeed: number;
  };
};

// 5 curated mode presets
// See docs/art-direction-modes.md for design rationale
const MODE_PRESETS: Record<string, ModePreset> = {
  minimal: {
    name: 'Minimal',
    description: 'Clean, subtle hand tracking',
    settings: {
      totalParticles: 70,
      handStreamBalance: 0.1,
      streamIntensity: 0.3,
      showStreams: false,
      showLinks: false,
      flowStrength: 0.4,
      noiseStrength: 0.3,
      colorIntensity: 0.7,
      depthExaggeration: 0.8,
      spacingStiffness: 0.7,
      streamResponsiveness: 0.8,
      glowIntensity: 0.2,
      particleSize: 0.35,
      showClay: false,
      clayParticles: 60,
      clayRadius: 1.0,
      sculptStrength: 0.5,
      showHandLines: true,
      showClayLines: false,
      clayJitterAmplitude: 0.0,    // Near-still
      clayJitterSpeed: 0.6,
    },
  },
  sculpt: {
    name: 'Sculpt',
    description: 'Focus on clay manipulation',
    settings: {
      totalParticles: 80,
      handStreamBalance: 0.2,
      streamIntensity: 0.4,
      showStreams: false,
      showLinks: false,
      flowStrength: 0.5,
      noiseStrength: 0.4,
      colorIntensity: 0.8,
      depthExaggeration: 1.0,
      spacingStiffness: 0.6,
      streamResponsiveness: 1.0,
      glowIntensity: 0.3,
      particleSize: 0.35,
      showClay: true,
      clayParticles: 120,
      clayRadius: 1.4,
      sculptStrength: 0.8,
      showHandLines: true,
      showClayLines: true,
      clayJitterAmplitude: 0.002,  // Subtle, precise control
      clayJitterSpeed: 0.8,
    },
  },
  flow: {
    name: 'Flow',
    description: 'Emphasize streams and motion',
    settings: {
      totalParticles: 100,
      handStreamBalance: 0.5,
      streamIntensity: 0.9,
      showStreams: true,
      showLinks: true,
      flowStrength: 1.2,
      noiseStrength: 0.8,
      colorIntensity: 1.0,
      depthExaggeration: 1.0,
      spacingStiffness: 0.5,
      streamResponsiveness: 1.5,
      glowIntensity: 0.5,
      particleSize: 0.4,
      showClay: false,
      clayParticles: 80,
      clayRadius: 1.0,
      sculptStrength: 0.5,
      showHandLines: false,
      showClayLines: false,
      clayJitterAmplitude: 0.006,  // Moderate (if clay enabled)
      clayJitterSpeed: 1.2,
    },
  },
  structure: {
    name: 'Structure',
    description: 'Skeletal wireframe emphasis',
    settings: {
      totalParticles: 90,
      handStreamBalance: 0.15,
      streamIntensity: 0.5,
      showStreams: false,
      showLinks: true,
      flowStrength: 0.6,
      noiseStrength: 0.4,
      colorIntensity: 0.85,
      depthExaggeration: 1.1,
      spacingStiffness: 0.8,
      streamResponsiveness: 0.9,
      glowIntensity: 0.25,
      particleSize: 0.32,
      showClay: true,
      clayParticles: 80,
      clayRadius: 1.1,
      sculptStrength: 0.6,
      showHandLines: true,
      showClayLines: true,
      clayJitterAmplitude: 0.001,  // Barely perceptible
      clayJitterSpeed: 0.6,
    },
  },
  expressive: {
    name: 'Expressive',
    description: 'Maximum visual impact',
    settings: {
      totalParticles: 130,
      handStreamBalance: 0.4,
      streamIntensity: 0.85,
      showStreams: true,
      showLinks: true,
      flowStrength: 1.0,
      noiseStrength: 0.7,
      colorIntensity: 1.1,
      depthExaggeration: 1.2,
      spacingStiffness: 0.5,
      streamResponsiveness: 1.3,
      glowIntensity: 0.6,
      particleSize: 0.45,
      showClay: true,
      clayParticles: 100,
      clayRadius: 1.3,
      sculptStrength: 0.7,
      showHandLines: true,
      showClayLines: true,
      clayJitterAmplitude: 0.004,  // Noticeable life
      clayJitterSpeed: 1.0,
    },
  },
};

const MODE_ORDER = ['minimal', 'sculpt', 'flow', 'structure', 'expressive'] as const;

export default function FingertipStreamApp() {
  // Mode & UI state
  const [currentMode, setCurrentMode] = useState<string>('sculpt');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [background, setBackground] = useState<'dark' | 'light'>('dark');
  const [showPreview, setShowPreview] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);

  // All adjustable parameters (initialized from sculpt preset)
  const defaultSettings = MODE_PRESETS.sculpt.settings;
  const [totalParticles, setTotalParticles] = useState(defaultSettings.totalParticles);
  const [handStreamBalance, setHandStreamBalance] = useState(defaultSettings.handStreamBalance);
  const [streamIntensity, setStreamIntensity] = useState(defaultSettings.streamIntensity);
  const [showStreams, setShowStreams] = useState(defaultSettings.showStreams);
  const [showLinks, setShowLinks] = useState(defaultSettings.showLinks);
  const [flowStrength, setFlowStrength] = useState(defaultSettings.flowStrength);
  const [noiseStrength, setNoiseStrength] = useState(defaultSettings.noiseStrength);
  const [colorIntensity, setColorIntensity] = useState(defaultSettings.colorIntensity);
  const [depthExaggeration, setDepthExaggeration] = useState(defaultSettings.depthExaggeration);
  const [spacingStiffness, setSpacingStiffness] = useState(defaultSettings.spacingStiffness);
  const [streamResponsiveness, setStreamResponsiveness] = useState(defaultSettings.streamResponsiveness);
  const [glowIntensity, setGlowIntensity] = useState(defaultSettings.glowIntensity);
  const [particleSize, setParticleSize] = useState(defaultSettings.particleSize);
  const [showClay, setShowClay] = useState(defaultSettings.showClay);
  const [clayParticles, setClayParticles] = useState(defaultSettings.clayParticles);
  const [clayRadius, setClayRadius] = useState(defaultSettings.clayRadius);
  const [sculptStrength, setSculptStrength] = useState(defaultSettings.sculptStrength);
  const [showHandLines, setShowHandLines] = useState(defaultSettings.showHandLines);
  const [showClayLines, setShowClayLines] = useState(defaultSettings.showClayLines);
  const [clayJitterAmplitude, setClayJitterAmplitude] = useState(defaultSettings.clayJitterAmplitude);
  const [clayJitterSpeed, setClayJitterSpeed] = useState(defaultSettings.clayJitterSpeed);

  // Clay simulation ref (for connection lines)
  const [claySimulation, setClaySimulation] = useState<ClaySimulation | null>(null);

  // Apply mode preset (does not reset clay shape)
  const applyMode = useCallback((modeKey: string) => {
    const preset = MODE_PRESETS[modeKey];
    if (!preset) return;

    setCurrentMode(modeKey);
    const s = preset.settings;
    setTotalParticles(s.totalParticles);
    setHandStreamBalance(s.handStreamBalance);
    setStreamIntensity(s.streamIntensity);
    setShowStreams(s.showStreams);
    setShowLinks(s.showLinks);
    setFlowStrength(s.flowStrength);
    setNoiseStrength(s.noiseStrength);
    setColorIntensity(s.colorIntensity);
    setDepthExaggeration(s.depthExaggeration);
    setSpacingStiffness(s.spacingStiffness);
    setStreamResponsiveness(s.streamResponsiveness);
    setGlowIntensity(s.glowIntensity);
    setParticleSize(s.particleSize);
    setShowClay(s.showClay);
    setClayParticles(s.clayParticles);
    setClayRadius(s.clayRadius);
    setSculptStrength(s.sculptStrength);
    setShowHandLines(s.showHandLines);
    setShowClayLines(s.showClayLines);
    setClayJitterAmplitude(s.clayJitterAmplitude);
    setClayJitterSpeed(s.clayJitterSpeed);
  }, []);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);

  // Panel drag handlers for mobile bottom sheet
  const handlePanelDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
  }, []);

  const handlePanelDragEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (dragStartY.current === null) return;
    const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;
    const delta = clientY - dragStartY.current;
    // Swipe down to close, up to open (threshold 30px)
    if (delta > 30) setPanelOpen(false);
    else if (delta < -30) setPanelOpen(true);
    dragStartY.current = null;
  }, []);

  const togglePanel = useCallback(() => setPanelOpen((o) => !o), []);

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
        dpr={[1, getMobileDPR()]}
        gl={{ antialias: !isMobile(), alpha: true }}
      >
        <color attach="background" args={[background === 'dark' ? '#0a0908' : '#f5f3ef']} />
        <ambientLight intensity={0.4} />
        <HandParticleSystem
          handsRef={handsRef}
          totalParticles={totalParticles}
          handStreamBalance={handStreamBalance}
          streamIntensity={streamIntensity}
          showStreams={showStreams}
          showLinks={showLinks}
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
        <ClayParticleSystem
          handsRef={handsRef}
          particleCount={clayParticles}
          enabled={showClay}
          paused={paused}
          blobRadius={clayRadius}
          sculptStrength={sculptStrength}
          jitterAmplitude={clayJitterAmplitude}
          jitterSpeed={clayJitterSpeed}
          onSimulationReady={setClaySimulation}
        />
        <HandConnectionLines
          handsRef={handsRef}
          enabled={showHandLines}
          opacity={0.25}
        />
        <ClayConnectionLines
          simulation={claySimulation}
          enabled={showClayLines && showClay}
          opacity={0.15}
          maxConnections={3}
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

      <div
        ref={panelRef}
        className={`panel ${panelOpen ? 'open' : ''}`}
      >
        <div
          className="panel-handle"
          onTouchStart={handlePanelDragStart}
          onTouchEnd={handlePanelDragEnd}
          onMouseDown={handlePanelDragStart}
          onMouseUp={handlePanelDragEnd}
          onClick={togglePanel}
          role="button"
          tabIndex={0}
          aria-label="Toggle controls panel"
        />
        <div className="panel-content">
        {/* Mode Selector */}
        <div className="panel-section">
          <div className="panel-title">Mode</div>
          <div className="mode-selector">
            {MODE_ORDER.map((key) => (
              <button
                key={key}
                className={`mode-btn ${currentMode === key ? 'active' : ''}`}
                onClick={() => applyMode(key)}
                title={MODE_PRESETS[key].description}
              >
                {MODE_PRESETS[key].name}
              </button>
            ))}
          </div>
          <div className="mode-description">
            {MODE_PRESETS[currentMode]?.description}
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="panel-section">
          <div className="panel-title">Quick Toggles</div>
          <div className="pill-row">
            <button
              className={showClay ? 'pill active' : 'pill'}
              onClick={() => setShowClay((c) => !c)}
            >
              {showClay ? 'Clay' : 'No Clay'}
            </button>
            <button
              className={showStreams ? 'pill active' : 'pill'}
              onClick={() => setShowStreams((s) => !s)}
            >
              {showStreams ? 'Streams' : 'No Streams'}
            </button>
            <button
              className={showHandLines ? 'pill active' : 'pill'}
              onClick={() => setShowHandLines((h) => !h)}
            >
              {showHandLines ? 'Lines' : 'No Lines'}
            </button>
          </div>
        </div>

        {/* Playback & Display */}
        <div className="panel-section">
          <div className="panel-title">Display</div>
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

        {/* Customize Button */}
        <div className="panel-section">
          <button
            className="customize-btn"
            onClick={() => setCustomizeOpen(true)}
          >
            Customize...
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

      {/* Customize Popup */}
      {customizeOpen && (
        <div className="customize-overlay" onClick={() => setCustomizeOpen(false)}>
          <div className="customize-popup" onClick={(e) => e.stopPropagation()}>
            <div className="customize-header">
              <span>Customize Settings</span>
              <button className="close-btn" onClick={() => setCustomizeOpen(false)}>×</button>
            </div>
            <div className="customize-content">
              {/* Particles Section */}
              <div className="customize-section">
                <div className="customize-title">Particles</div>
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
              </div>

              {/* Streams Section */}
              <div className="customize-section">
                <div className="customize-title">Streams</div>
                <div className="pill-row">
                  <button
                    className={showStreams ? 'pill active' : 'pill'}
                    onClick={() => setShowStreams((s) => !s)}
                  >
                    {showStreams ? 'Streams On' : 'Streams Off'}
                  </button>
                  <button
                    className={showLinks ? 'pill active' : 'pill'}
                    onClick={() => setShowLinks((l) => !l)}
                  >
                    {showLinks ? 'Links On' : 'Links Off'}
                  </button>
                </div>
                <label>
                  Hand/Stream: {Math.round((1 - handStreamBalance) * 100)}% / {Math.round(handStreamBalance * 100)}%
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
                  Intensity: {streamIntensity.toFixed(1)}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={streamIntensity}
                    onChange={(e) => setStreamIntensity(Number(e.target.value))}
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
              </div>

              {/* Motion Section */}
              <div className="customize-section">
                <div className="customize-title">Motion</div>
                <label>
                  Flow: {flowStrength.toFixed(1)}
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
                  Noise: {noiseStrength.toFixed(1)}
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

              {/* Depth & Spacing Section */}
              <div className="customize-section">
                <div className="customize-title">Depth & Spacing</div>
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
              </div>

              {/* Structure Section */}
              <div className="customize-section">
                <div className="customize-title">Structure Lines</div>
                <div className="pill-row">
                  <button
                    className={showHandLines ? 'pill active' : 'pill'}
                    onClick={() => setShowHandLines((h) => !h)}
                  >
                    {showHandLines ? 'Hand Lines' : 'No Hand Lines'}
                  </button>
                  <button
                    className={showClayLines ? 'pill active' : 'pill'}
                    onClick={() => setShowClayLines((c) => !c)}
                  >
                    {showClayLines ? 'Clay Lines' : 'No Clay Lines'}
                  </button>
                </div>
              </div>

              {/* Clay Section */}
              <div className="customize-section">
                <div className="customize-title">Clay</div>
                <div className="pill-row">
                  <button
                    className={showClay ? 'pill active' : 'pill'}
                    onClick={() => setShowClay((c) => !c)}
                  >
                    {showClay ? 'Clay On' : 'Clay Off'}
                  </button>
                </div>
                <label>
                  Particles: {clayParticles}
                  <input
                    type="range"
                    min="40"
                    max="150"
                    step="10"
                    value={clayParticles}
                    onChange={(e) => setClayParticles(Number(e.target.value))}
                  />
                </label>
                <label>
                  Size: {clayRadius.toFixed(1)}
                  <input
                    type="range"
                    min="0.6"
                    max="2.0"
                    step="0.2"
                    value={clayRadius}
                    onChange={(e) => setClayRadius(Number(e.target.value))}
                  />
                </label>
                <label>
                  Sculpt Strength: {sculptStrength.toFixed(1)}
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={sculptStrength}
                    onChange={(e) => setSculptStrength(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

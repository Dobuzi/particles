// Hand Particle Visualization App
// PRIMARY: Hand-form particles along skeleton
// SECONDARY: Thin streams between matching fingertips

import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState, useCallback } from 'react';
import { HandParticleSystem } from './components/HandParticleSystem';
import { ClayParticleSystem } from './components/ClayParticleSystem';
import { HandConnectionLines, ClayConnectionLines } from './components/ConnectionLines';
import { useHandTracking } from './hooks/useHandTracking';
import { forceMerge, type ClaySimulation } from './simulation/ClaySimulation';
import { loadSettings, saveSettings, clearSettings } from './hooks/usePersistedSettings';

// Mobile detection and performance
const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
const getMobileDPR = () => isMobile() ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;

// Sculpt tool modes
export type SculptToolMode = 'grab' | 'stretch' | 'refine';

// Refine sub-tool modes
export type RefineMode = 'scrape' | 'flatten';
export type RefineBrush = 'smooth' | 'carve' | 'stamp';

const TOOL_MODE_INFO: Record<SculptToolMode, { label: string; description: string }> = {
  grab: { label: 'Grab', description: 'Pick and pull clay' },
  stretch: { label: 'Stretch', description: 'Two-point deformation' },
  refine: { label: 'Refine', description: 'Surface refinement' },
};

const REFINE_MODE_INFO: Record<RefineMode, { label: string; description: string }> = {
  scrape: { label: 'Scrape', description: 'Stroke to smooth/shape' },
  flatten: { label: 'Flatten', description: 'Press to flatten' },
};

const REFINE_BRUSH_INFO: Record<RefineBrush, { label: string; description: string }> = {
  smooth: { label: 'Smooth', description: 'Relax surface' },
  carve: { label: 'Carve', description: 'Create grooves' },
  stamp: { label: 'Stamp', description: 'Circular press imprint' },
};

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
    sculptRadius: number;
    sculptMemoryRate: number;
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
      sculptStrength: 0.3,         // Low: mostly point dragging
      sculptRadius: 0.5,           // Small influence region
      sculptMemoryRate: 0.03,      // Low memory retention
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
      sculptStrength: 0.8,         // Strong: responsive deformation
      sculptRadius: 1.0,           // Large influence region
      sculptMemoryRate: 0.12,      // High memory retention
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
      sculptStrength: 0.5,         // Medium: softer sculpt
      sculptRadius: 0.7,           // Medium influence
      sculptMemoryRate: 0.04,      // Low: more elastic recovery
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
      sculptStrength: 0.4,         // Lower: structure preserved
      sculptRadius: 0.4,           // Small: limited deformation
      sculptMemoryRate: 0.03,      // Low: maintain structure
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
      sculptStrength: 0.75,        // High: strong sculpt
      sculptRadius: 0.9,           // Large influence
      sculptMemoryRate: 0.10,      // High memory retention
      showHandLines: true,
      showClayLines: true,
      clayJitterAmplitude: 0.004,  // Noticeable life
      clayJitterSpeed: 1.0,
    },
  },
};

const MODE_ORDER = ['minimal', 'sculpt', 'flow', 'structure', 'expressive'] as const;

export default function FingertipStreamApp() {
  // Load persisted settings
  const saved = loadSettings();

  // Mode & UI state
  const [currentMode, setCurrentMode] = useState<string>(saved.currentMode);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [paused, setPaused] = useState(saved.paused);
  const [background, setBackground] = useState<'dark' | 'light'>(saved.background);
  const [showPreview, setShowPreview] = useState(saved.showPreview);
  const [panelOpen, setPanelOpen] = useState(false);

  // Sculpt tool mode (gesture-free switching)
  const [toolMode, setToolMode] = useState<SculptToolMode>('grab');

  // Refine sub-tool state
  const [refineMode, setRefineMode] = useState<RefineMode>('scrape');
  const [refineBrush, setRefineBrush] = useState<RefineBrush>('smooth');

  // All adjustable parameters (initialized from saved or sculpt preset)
  const defaultSettings = (MODE_PRESETS[saved.currentMode] ?? MODE_PRESETS.sculpt).settings;
  const [totalParticles, setTotalParticles] = useState(defaultSettings.totalParticles);
  const [handStreamBalance, setHandStreamBalance] = useState(defaultSettings.handStreamBalance);
  const [streamIntensity, setStreamIntensity] = useState(defaultSettings.streamIntensity);
  const [showStreams, setShowStreams] = useState(saved.showStreams);
  const [showLinks, setShowLinks] = useState(defaultSettings.showLinks);
  const [flowStrength, setFlowStrength] = useState(defaultSettings.flowStrength);
  const [noiseStrength, setNoiseStrength] = useState(defaultSettings.noiseStrength);
  const [colorIntensity, setColorIntensity] = useState(defaultSettings.colorIntensity);
  const [depthExaggeration, setDepthExaggeration] = useState(defaultSettings.depthExaggeration);
  const [spacingStiffness, setSpacingStiffness] = useState(defaultSettings.spacingStiffness);
  const [streamResponsiveness, setStreamResponsiveness] = useState(defaultSettings.streamResponsiveness);
  const [glowIntensity, setGlowIntensity] = useState(defaultSettings.glowIntensity);
  const [particleSize, setParticleSize] = useState(defaultSettings.particleSize);
  const [showClay, setShowClay] = useState(saved.showClay);
  const [clayParticles, setClayParticles] = useState(defaultSettings.clayParticles);
  const [clayRadius, setClayRadius] = useState(defaultSettings.clayRadius);
  const [sculptStrength, setSculptStrength] = useState(defaultSettings.sculptStrength);
  const [sculptRadius, setSculptRadius] = useState(defaultSettings.sculptRadius);
  const [sculptMemoryRate, setSculptMemoryRate] = useState(defaultSettings.sculptMemoryRate);
  const [showHandLines, setShowHandLines] = useState(saved.showHandLines);
  const [showClayLines, setShowClayLines] = useState(saved.showClayLines);
  const [clayJitterAmplitude, setClayJitterAmplitude] = useState(defaultSettings.clayJitterAmplitude);
  const [clayJitterSpeed, setClayJitterSpeed] = useState(defaultSettings.clayJitterSpeed);

  // Clay simulation ref (for connection lines)
  const [claySimulation, setClaySimulation] = useState<ClaySimulation | null>(null);

  // Clay split status
  const [claySplit, setClaySplit] = useState(false);

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
    setSculptRadius(s.sculptRadius);
    setSculptMemoryRate(s.sculptMemoryRate);
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

  // Persist settings on change
  useEffect(() => {
    saveSettings({
      currentMode,
      background,
      showPreview,
      showClay,
      showStreams,
      showHandLines,
      showClayLines,
      paused,
    });
  }, [currentMode, background, showPreview, showClay, showStreams, showHandLines, showClayLines, paused]);

  useEffect(() => {
    document.body.classList.toggle('light', background === 'light');
  }, [background]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setPaused((p) => !p);
          break;
        case 'c':
          setShowPreview((p) => !p);
          break;
        case 'b':
          setBackground((bg) => (bg === 'dark' ? 'light' : 'dark'));
          break;
        case 's':
          setShowStreams((s) => !s);
          break;
        case 'l':
          setShowHandLines((h) => !h);
          break;
        case 'k':
          setShowClay((c) => !c);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5': {
          const idx = parseInt(e.key) - 1;
          if (idx >= 0 && idx < MODE_ORDER.length) {
            applyMode(MODE_ORDER[idx]);
          }
          break;
        }
        case 'Escape':
          setCustomizeOpen(false);
          setPanelOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyMode]);

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
          sculptRadius={sculptRadius}
          sculptMemoryRate={sculptMemoryRate}
          jitterAmplitude={clayJitterAmplitude}
          jitterSpeed={clayJitterSpeed}
          toolMode={toolMode}
          refineMode={refineMode}
          refineBrush={refineBrush}
          onSimulationReady={setClaySimulation}
          onSplitStatusChange={setClaySplit}
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

      <div className="hud" role="status" aria-live="polite" aria-label="Hand tracking status">
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
          <div className="mode-selector" role="radiogroup" aria-label="Visualization mode">
            {MODE_ORDER.map((key, idx) => (
              <button
                key={key}
                className={`mode-btn ${currentMode === key ? 'active' : ''}`}
                onClick={() => applyMode(key)}
                title={`${MODE_PRESETS[key].description} (${idx + 1})`}
                role="radio"
                aria-checked={currentMode === key}
                aria-label={`${MODE_PRESETS[key].name} mode`}
              >
                {MODE_PRESETS[key].name}
              </button>
            ))}
          </div>
          <div className="mode-description">
            {MODE_PRESETS[currentMode]?.description}
          </div>
        </div>

        {/* Sculpt Tool Selector */}
        {showClay && (
          <div className="panel-section">
            <div className="panel-title">Sculpt Tool</div>
            <div className="tool-selector">
              {(['grab', 'stretch', 'refine'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`tool-btn ${toolMode === mode ? 'active' : ''}`}
                  onClick={() => setToolMode(mode)}
                  title={TOOL_MODE_INFO[mode].description}
                >
                  {TOOL_MODE_INFO[mode].label}
                </button>
              ))}
            </div>
            <div className="tool-description">
              {toolMode === 'refine'
                ? `${REFINE_MODE_INFO[refineMode].label}: ${REFINE_BRUSH_INFO[refineBrush].description}`
                : TOOL_MODE_INFO[toolMode].description}
            </div>

            {/* Refine sub-tools (shown only when Refine is active) */}
            {toolMode === 'refine' && (
              <div className="refine-controls">
                {/* Scrape/Flatten mode toggle */}
                <div className="refine-mode-selector">
                  {(['scrape', 'flatten'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`refine-mode-btn ${refineMode === mode ? 'active' : ''}`}
                      onClick={() => setRefineMode(mode)}
                      title={REFINE_MODE_INFO[mode].description}
                    >
                      {REFINE_MODE_INFO[mode].label}
                    </button>
                  ))}
                </div>
                {/* Brush type toggle */}
                <div className="refine-brush-selector">
                  {(['smooth', 'carve', 'stamp'] as const).map((brush) => (
                    <button
                      key={brush}
                      className={`refine-brush-btn ${refineBrush === brush ? 'active' : ''}`}
                      onClick={() => setRefineBrush(brush)}
                      title={REFINE_BRUSH_INFO[brush].description}
                    >
                      {REFINE_BRUSH_INFO[brush].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {claySplit && (
              <button
                className="merge-btn"
                onClick={() => {
                  if (claySimulation) {
                    forceMerge(claySimulation);
                    setClaySplit(false);
                  }
                }}
              >
                Merge Clay
              </button>
            )}
          </div>
        )}

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
            <button className="pill" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume animation (Space)' : 'Pause animation (Space)'}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="pill"
              onClick={() => setBackground((b) => (b === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${background === 'dark' ? 'light' : 'dark'} theme (B)`}
            >
              {background === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="pill" onClick={() => setShowPreview((p) => !p)} aria-label={showPreview ? 'Hide camera preview (C)' : 'Show camera preview (C)'}>
              {showPreview ? 'Hide Cam' : 'Show Cam'}
            </button>
            <button
              className="pill"
              onClick={() => {
                clearSettings();
                applyMode('sculpt');
                setBackground('dark');
                setShowPreview(true);
                setPaused(false);
              }}
              aria-label="Reset all settings to defaults"
            >
              Reset
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

      <div className={`preview ${showPreview ? 'show' : 'hide'}`} aria-label="Camera preview">
        <div className="preview-inner">
          <canvas ref={previewCanvasRef} width={240} height={135} aria-label="Webcam hand tracking preview" />
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
        <div className="customize-overlay" onClick={() => setCustomizeOpen(false)} role="dialog" aria-modal="true" aria-label="Customize settings">
          <div className="customize-popup" onClick={(e) => e.stopPropagation()}>
            <div className="customize-header">
              <span>Customize Settings</span>
              <button className="close-btn" onClick={() => setCustomizeOpen(false)} aria-label="Close settings">×</button>
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
                  Sculpt Strength: {sculptStrength.toFixed(2)}
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={sculptStrength}
                    onChange={(e) => setSculptStrength(Number(e.target.value))}
                  />
                </label>
                <label>
                  Sculpt Radius: {sculptRadius.toFixed(2)}
                  <input
                    type="range"
                    min="0.3"
                    max="1.5"
                    step="0.05"
                    value={sculptRadius}
                    onChange={(e) => setSculptRadius(Number(e.target.value))}
                  />
                </label>
                <label>
                  Sculpt Memory: {sculptMemoryRate.toFixed(2)}
                  <input
                    type="range"
                    min="0.01"
                    max="0.2"
                    step="0.01"
                    value={sculptMemoryRate}
                    onChange={(e) => setSculptMemoryRate(Number(e.target.value))}
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

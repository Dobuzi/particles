import { Canvas } from '@react-three/fiber';
import React, { useEffect, useMemo, useState } from 'react';
import { ParticleField } from './components/ParticleField';
import { useHandDrawing } from './hooks/useHandDrawing';

const particlePresets = [20000, 30000, 60000, 120000] as const;

export default function App() {
  const [particleCount, setParticleCount] = useState<number>(20000);
  const [flowStrength, setFlowStrength] = useState(1.2);
  const [attractionStrength, setAttractionStrength] = useState(1.4);
  const [alignmentStrength, setAlignmentStrength] = useState(0.8);
  const [repulsionStrength, setRepulsionStrength] = useState(0.4);
  const [drawEnabled, setDrawEnabled] = useState(true);
  const [perfMode, setPerfMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [background, setBackground] = useState<'dark' | 'light'>('dark');

  const volume = 2.6;
  const { shapeRef, state, clearShape } = useHandDrawing({
    enabled: drawEnabled,
    volume,
  });

  const guidance = useMemo(() => {
    if (perfMode) return 'Performance mode (hand tracking off)';
    if (state.status === 'denied') return 'Camera access denied';
    if (state.status === 'error') return 'Camera error';
    if (!drawEnabled) return 'Gesture drawing disabled';
    if (state.status === 'tracking' && !state.isDrawing) return 'Pinch to draw';
    if (state.isDrawing) return 'Drawing in 3D space';
    return 'Show your hand to the camera';
  }, [drawEnabled, state.isDrawing, state.status]);

  useEffect(() => {
    if (!perfMode) return;
    setDrawEnabled(false);
    clearShape();
    if (particleCount > 20000) setParticleCount(20000);
  }, [perfMode, particleCount, clearShape]);

  useEffect(() => {
    document.body.classList.toggle('light', background === 'light');
  }, [background]);

  return (
    <div className={`app ${background}`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 55 }}
        dpr={[1, 1.25]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={[background === 'dark' ? '#0a0b12' : '#f6f4ef']} />
        <ambientLight intensity={0.4} />
        <ParticleField
          count={particleCount}
          volume={volume}
          flowStrength={flowStrength}
          attractionStrength={attractionStrength}
          alignmentStrength={alignmentStrength}
          repulsionStrength={repulsionStrength}
          paused={paused}
          perfMode={perfMode}
          shapeRef={shapeRef}
        />
      </Canvas>

      <div className="hud">
        <div className="title">Freedom Field</div>
        <div className="status">{guidance}</div>
        <div className="status subtle">Points: {state.points.length}</div>
      </div>

      <div className="panel">
        <div className="panel-section">
          <div className="panel-title">Particles</div>
          <div className="pill-row">
            {particlePresets.map((preset) => (
              <button
                key={preset}
                className={preset === particleCount ? 'pill active' : 'pill'}
                onClick={() => setParticleCount(preset)}
                disabled={perfMode && preset > 20000}
              >
                {preset / 1000}k
              </button>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-title">Flow</div>
          <label>
            Strength
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={flowStrength}
              onChange={(event) => setFlowStrength(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="panel-section">
          <div className="panel-title">Shape Forces</div>
          <label>
            Attraction
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={attractionStrength}
              onChange={(event) => setAttractionStrength(Number(event.target.value))}
            />
          </label>
          <label>
            Alignment
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={alignmentStrength}
              onChange={(event) => setAlignmentStrength(Number(event.target.value))}
            />
          </label>
          <label>
            Repulsion
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={repulsionStrength}
              onChange={(event) => setRepulsionStrength(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="panel-section">
          <div className="panel-title">Gesture</div>
          <div className="pill-row">
            <button
              className={drawEnabled ? 'pill active' : 'pill'}
              onClick={() => setDrawEnabled((prev) => !prev)}
              disabled={perfMode}
            >
              {drawEnabled ? 'Drawing On' : 'Drawing Off'}
            </button>
            <button className="pill" onClick={clearShape}>
              Clear Shape
            </button>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-title">Playback</div>
          <div className="pill-row">
            <button className="pill" onClick={() => setPaused((prev) => !prev)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="pill"
              onClick={() =>
                setBackground((prev) => (prev === 'dark' ? 'light' : 'dark'))
              }
            >
              {background === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              className={perfMode ? 'pill active' : 'pill'}
              onClick={() => setPerfMode((prev) => !prev)}
            >
              {perfMode ? 'Perf On' : 'Perf Off'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

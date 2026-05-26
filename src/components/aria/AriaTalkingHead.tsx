'use client';
import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { buildVisemes, Viseme } from './textToVisemes';

const ANIMATIONS_URL = 'https://raw.githubusercontent.com/Yacine-Mekideche/IAcine-Virtual-Avatar/main/front/public/models/animations.glb';
const MOUTH_MORPHS = ['Fcl_MTH_A','Fcl_MTH_I','Fcl_MTH_U','Fcl_MTH_E','Fcl_MTH_O','Fcl_MTH_Close'];

function setMorph(meshes: THREE.Mesh[], name: string, value: number) {
  for (const m of meshes) {
    if (!m.morphTargetDictionary || !m.morphTargetInfluences) continue;
    const i = m.morphTargetDictionary[name];
    if (i !== undefined) m.morphTargetInfluences[i] = value;
  }
}

function AvatarScene({ mode, replyText }: { mode: string; replyText: string }) {
  const { scene } = useGLTF('/models/Aria.glb');
  const { animations } = useGLTF(ANIMATIONS_URL);
  const { actions, mixer } = useAnimations(animations, scene);

  const faceMeshes = useRef<THREE.Mesh[]>([]);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const ready = useRef(false);
  const currentAnim = useRef<string>('');

  // Extract face meshes
  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && obj.name.includes('Face')) {
        meshes.push(mesh);
      }
    });
    faceMeshes.current = meshes;
    ready.current = meshes.length > 0;
  }, [scene]);

  // Play idle animation on mount
  useEffect(() => {
    if (!actions || !animations.length) return;
    const idle = actions['Idle'] ?? actions[Object.keys(actions)[0]];
    if (idle) {
      idle.reset().fadeIn(0.5).play();
      currentAnim.current = 'Idle';
    }
  }, [actions, animations]);

  // Switch animation based on mode
  useEffect(() => {
    if (!actions) return;
    const target = mode === 'talking'
      ? (actions['Talking_0'] ?? actions['Talking_1'] ?? actions['Idle'])
      : mode === 'thinking'
      ? (actions['Idle'])
      : actions['Idle'];

    const animName = mode === 'talking' ? 'Talking_0' : 'Idle';
    if (animName === currentAnim.current) return;

    const prev = actions[currentAnim.current];
    if (prev) prev.fadeOut(0.4);
    if (target) { target.reset().fadeIn(0.4).play(); }
    currentAnim.current = animName;
  }, [mode, actions]);

  // Visemes
  useEffect(() => {
    if (mode === 'talking' && replyText) {
      visemes.current = buildVisemes(replyText);
      talkStart.current = performance.now();
    } else {
      talkStart.current = null;
      visemes.current = [];
    }
  }, [mode, replyText]);

  useFrame((_, delta) => {
    if (!ready.current) return;
    mixer.update(delta);
    const meshes = faceMeshes.current;

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      setMorph(meshes, 'Fcl_EYE_Close', 1);
      setTimeout(() => { setMorph(meshes, 'Fcl_EYE_Close', 0); blinking.current = false; }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // Talking lip sync
    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      MOUTH_MORPHS.forEach(m => setMorph(meshes, m, 0));
      if (cur && cur.morph !== 'Fcl_MTH_Close') setMorph(meshes, cur.morph, cur.value);
      return;
    }

    // Idle — mouth closed
    MOUTH_MORPHS.forEach(m => setMorph(meshes, m, 0));
  });

  return <primitive object={scene} />;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: { mode?: string; replyText?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 1.4, 5.0], fov: 12 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.4, 0)}
    >
      <ambientLight intensity={1.2} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <Suspense fallback={null}>
        <AvatarScene mode={mode} replyText={replyText} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload('/models/Aria.glb');
useGLTF.preload(ANIMATIONS_URL);

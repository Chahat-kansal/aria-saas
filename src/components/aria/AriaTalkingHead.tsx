'use client';
import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildVisemes, Viseme } from './textToVisemes';

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
  const faceMeshes = useRef<THREE.Mesh[]>([]);
  const headBone = useRef<THREE.Object3D | null>(null);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const ready = useRef(false);

  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && obj.name.includes('Face')) meshes.push(mesh);
      if (obj.name === 'J_Bip_C_Head') headBone.current = obj;
    });
    faceMeshes.current = meshes;
    ready.current = meshes.length > 0;
  }, [scene]);

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
    const meshes = faceMeshes.current;

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      setMorph(meshes, 'Fcl_EYE_Close', 1);
      setTimeout(() => { setMorph(meshes, 'Fcl_EYE_Close', 0); blinking.current = false; }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // Subtle head movement — looks alive without needing skeleton animation
    if (headBone.current) {
      const t = Date.now() * 0.001;
      if (mode === 'thinking') {
        headBone.current.rotation.y = Math.sin(t * 0.8) * 0.06;
        headBone.current.rotation.x = -0.05 + Math.sin(t * 0.6) * 0.02;
      } else {
        headBone.current.rotation.y = Math.sin(t * 0.4) * 0.03;
        headBone.current.rotation.x = Math.sin(t * 0.3) * 0.015;
      }
    }

    // Lip sync
    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      MOUTH_MORPHS.forEach(m => setMorph(meshes, m, 0));
      if (cur && cur.morph !== 'Fcl_MTH_Close') setMorph(meshes, cur.morph, cur.value);
      return;
    }
    MOUTH_MORPHS.forEach(m => setMorph(meshes, m, 0));
  });

  return <primitive object={scene} />;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: { mode?: string; replyText?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 1.35, 1.6], fov: 22 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.35, 0)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <Suspense fallback={null}>
        <AvatarScene mode={mode} replyText={replyText} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload('/models/Aria.glb');

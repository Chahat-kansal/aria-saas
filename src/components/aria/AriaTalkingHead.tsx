'use client';
import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildVisemes, Viseme, MorphName } from './textToVisemes';

const MOUTH: (MorphName | 'Fcl_EYE_Close')[] = [
  'Fcl_MTH_A','Fcl_MTH_I','Fcl_MTH_U','Fcl_MTH_E','Fcl_MTH_O','Fcl_MTH_Close'
];

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
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const headBone = useRef<THREE.Object3D | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && obj.name.includes('Face')) {
        meshes.push(mesh);
      }
      if (!headBone.current && (obj.name === 'J_Bip_C_Head' || obj.name === 'Head')) {
        headBone.current = obj;
      }
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

    if (mode === 'thinking') {
      MOUTH.forEach(m => setMorph(meshes, m, 0));
      if (headBone.current) {
        headBone.current.rotation.y = Math.sin(Date.now() * 0.001) * 0.06;
        headBone.current.rotation.x = -0.04;
      }
      return;
    }

    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      MOUTH.forEach(m => setMorph(meshes, m, 0));
      if (cur && cur.morph !== 'Fcl_MTH_Close') setMorph(meshes, cur.morph, cur.value);
      return;
    }

    // Idle
    MOUTH.forEach(m => setMorph(meshes, m, 0));
    if (headBone.current) {
      headBone.current.rotation.y *= 0.92;
      headBone.current.rotation.x *= 0.92;
    }
  });

  return <primitive object={scene} />;
}

function Loader() {
  return null; // transparent while loading
}

interface Props { mode?: string; replyText?: string; }

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 1.4, 4.5], fov: 15 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.4, 0)}
    >
      <ambientLight intensity={1.2} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <Suspense fallback={<Loader />}>
        <AvatarScene mode={mode} replyText={replyText} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload('/models/Aria.glb');

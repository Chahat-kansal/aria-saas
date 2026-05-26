'use client';
import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildVisemes, Viseme, MorphName } from './textToVisemes';

// ── Morph helper — sets a named morph target on all face primitives ──────────
function setMorph(faceMeshes: THREE.Mesh[], name: MorphName | 'Fcl_EYE_Close' | 'Fcl_ALL_Joy' | 'Fcl_ALL_Sorrow', value: number) {
  for (const mesh of faceMeshes) {
    const dict = mesh.morphTargetDictionary;
    const inf = mesh.morphTargetInfluences;
    if (!dict || !inf) continue;
    const idx = dict[name];
    if (idx !== undefined) inf[idx] = value;
  }
}

// ── Inner scene — runs inside <Canvas> ───────────────────────────────────────
function AvatarScene({ mode, replyText }: { mode: 'idle' | 'thinking' | 'talking'; replyText: string }) {
  const { scene } = useGLTF('/models/Aria.glb');
  const faceMeshes = useRef<THREE.Mesh[]>([]);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(2 + Math.random() * 2);
  const blinking = useRef(false);
  const headBone = useRef<THREE.Object3D | null>(null);

  // Extract face meshes + head bone once on load
  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh && obj.name.includes('Face')) {
        meshes.push(obj as THREE.Mesh);
      }
      if (obj.name === 'Head' || obj.name === 'head' || obj.name === 'J_Bip_C_Head') {
        headBone.current = obj;
      }
    });
    faceMeshes.current = meshes;
    // Start in neutral
    setMorph(meshes, 'Fcl_MTH_Close', 0);
  }, [scene]);

  // When reply text arrives, build visemes
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
    const meshes = faceMeshes.current;
    if (!meshes.length) return;

    // ── Natural blink ──────────────────────────────────────────────────────
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      setMorph(meshes, 'Fcl_EYE_Close', 1);
      setTimeout(() => {
        setMorph(meshes, 'Fcl_EYE_Close', 0);
        blinking.current = false;
      }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // ── Thinking: gentle head sway, mouth closed ───────────────────────────
    if (mode === 'thinking') {
      MOUTH_MORPHS.forEach(m => setMorph(meshes, m, 0));
      if (headBone.current) {
        headBone.current.rotation.y = Math.sin(Date.now() * 0.0012) * 0.06;
        headBone.current.rotation.x = -0.05 + Math.sin(Date.now() * 0.0008) * 0.02;
      }
      return;
    }

    // ── Talking: drive mouth from visemes ─────────────────────────────────
    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const current = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      MOUTH_MORPHS.forEach(m => setMorph(meshes, m, 0));
      if (current && current.morph !== 'Fcl_MTH_Close') {
        setMorph(meshes, current.morph, current.value);
      }
      return;
    }

    // ── Idle: mouth closed, head neutral ──────────────────────────────────
    MOUTH_MORPHS.forEach(m => setMorph(meshes, m, 0));
    if (headBone.current) {
      headBone.current.rotation.y += (-headBone.current.rotation.y) * 0.05;
      headBone.current.rotation.x += (-headBone.current.rotation.x) * 0.05;
    }
  });

  return <primitive object={scene} />;
}

const MOUTH_MORPHS: MorphName[] = ['Fcl_MTH_A','Fcl_MTH_I','Fcl_MTH_U','Fcl_MTH_E','Fcl_MTH_O','Fcl_MTH_Close'];

// ── Public component ─────────────────────────────────────────────────────────
interface Props {
  mode?: 'idle' | 'thinking' | 'talking';
  replyText?: string;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 1.4, 4.5], fov: 15 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => { camera.lookAt(0, 1.4, 0); }}
    >
      <ambientLight intensity={1.2} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <AvatarScene mode={mode} replyText={replyText} />
    </Canvas>
  );
}

useGLTF.preload('/models/Aria.glb');

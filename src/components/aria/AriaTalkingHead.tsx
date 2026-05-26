'use client';
import { useRef, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import { buildVisemes, Viseme } from './textToVisemes';

const MOUTH_MORPHS = ['aa','ih','ou','ee','oh'];
const EXPR_MAP: Record<string, string> = {
  'Fcl_MTH_A': 'aa', 'Fcl_MTH_I': 'ih', 'Fcl_MTH_U': 'ou',
  'Fcl_MTH_E': 'ee', 'Fcl_MTH_O': 'oh',
};

function AvatarScene({ mode, replyText }: { mode: string; replyText: string }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);

  // Load VRM + VRMA on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const loader = new GLTFLoader();
      loader.register(p => new VRMLoaderPlugin(p));
      loader.register(p => new VRMAnimationLoaderPlugin(p));

      const gltf = await loader.loadAsync('/models/Aria.glb');
      if (cancelled) return;

      const loadedVrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      // Don't set rotation — VRMA animation controls orientation
      setVrm(loadedVrm);

      // Load idle VRMA
      try {
        const animGltf = await loader.loadAsync('/models/idle.vrma');
        if (cancelled) return;
        const vrmAnim = animGltf.userData.vrmAnimations?.[0];
        if (vrmAnim) {
          const mixer = new THREE.AnimationMixer(loadedVrm.scene);
          const clip = createVRMAnimationClip(vrmAnim, loadedVrm);
          mixer.clipAction(clip).play();
          mixerRef.current = mixer;
        }
      } catch (e) {
        console.warn('VRMA load failed:', e);
      }
    }
    load().catch(console.error);
    return () => { cancelled = true; };
  }, []);

  // Visemes on reply
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
    if (!vrm) return;
    mixerRef.current?.update(delta);
    vrm.update(delta);

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      vrm.expressionManager?.setValue('blink', 1);
      setTimeout(() => { vrm.expressionManager?.setValue('blink', 0); blinking.current = false; }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // Lip sync
    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      MOUTH_MORPHS.forEach(m => vrm.expressionManager?.setValue(m, 0));
      if (cur && cur.morph !== 'Fcl_MTH_Close') {
        const expr = EXPR_MAP[cur.morph];
        if (expr) vrm.expressionManager?.setValue(expr, cur.value);
      }
      return;
    }
    MOUTH_MORPHS.forEach(m => vrm.expressionManager?.setValue(m, 0));
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: { mode?: string; replyText?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 1.58, 1.2], fov: 10 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.58, 0)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <Suspense fallback={null}>
        <AvatarScene mode={mode} replyText={replyText} />
      </Suspense>
    </Canvas>
  );
}

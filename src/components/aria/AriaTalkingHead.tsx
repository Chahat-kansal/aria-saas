'use client';
import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import { buildVisemes, Viseme } from './textToVisemes';

const EXPR_MAP: Record<string, string> = {
  'Fcl_MTH_A': VRMExpressionPresetName.Aa,
  'Fcl_MTH_I': VRMExpressionPresetName.Ih,
  'Fcl_MTH_U': VRMExpressionPresetName.Ou,
  'Fcl_MTH_E': VRMExpressionPresetName.Ee,
  'Fcl_MTH_O': VRMExpressionPresetName.Oh,
};
const MOUTH_EXPRS = Object.values(EXPR_MAP);

function AvatarScene({ mode, replyText }: { mode: string; replyText: string }) {
  const vrmRef = useRef<VRM | null>(null);
  const groupRef = useRef<THREE.Group>(new THREE.Group());
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleClipRef = useRef<THREE.AnimationClip | null>(null);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const loader = new GLTFLoader();
      loader.register(p => new VRMLoaderPlugin(p, { autoUpdateHumanBones: true }));
      loader.register(p => new VRMAnimationLoaderPlugin(p));

      const gltf = await loader.loadAsync('/models/Aria.glb');
      if (cancelled) return;

      const vrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);

      // Add to persistent group — never unmount
      groupRef.current.add(vrm.scene);
      vrmRef.current = vrm;

      const mixer = new THREE.AnimationMixer(vrm.scene);
      mixerRef.current = mixer;

      try {
        const [a01, a02] = await Promise.all([
          loader.loadAsync('/models/VRMA_01.vrma'),
          loader.loadAsync('/models/VRMA_02.vrma'),
        ]);
        if (cancelled) return;

        const vrma01 = a01.userData.vrmAnimations?.[0];
        const vrma02 = a02.userData.vrmAnimations?.[0];

        if (vrma01) idleClipRef.current = createVRMAnimationClip(vrma01, vrm);

        if (vrma02 && idleClipRef.current) {
          const greetClip = createVRMAnimationClip(vrma02, vrm);
          const greetAction = mixer.clipAction(greetClip);
          greetAction.setLoop(THREE.LoopOnce, 1);
          greetAction.clampWhenFinished = true;
          greetAction.play();

          mixer.addEventListener('finished', () => {
            greetAction.fadeOut(0.5);
            mixer.clipAction(idleClipRef.current!).reset().fadeIn(0.5).play();
          });
        } else if (idleClipRef.current) {
          mixer.clipAction(idleClipRef.current).play();
        }
      } catch (e) {
        console.warn('VRMA load error:', e);
        // Just stay in T-pose if animations fail
      }

      loaded.current = true;
    }

    load().catch(console.error);
    return () => { cancelled = true; };
  }, []);

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
    const vrm = vrmRef.current;
    if (!vrm) return;

    mixerRef.current?.update(delta);
    vrm.update(delta);

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, 1);
      setTimeout(() => {
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, 0);
        blinking.current = false;
      }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // Lip sync
    MOUTH_EXPRS.forEach(e => vrm.expressionManager?.setValue(e, 0));
    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      if (cur && cur.morph !== 'Fcl_MTH_Close') {
        const expr = EXPR_MAP[cur.morph];
        if (expr) vrm.expressionManager?.setValue(expr, cur.value);
      }
    }
  });

  // Always render the group — VRM gets added to it when loaded
  return <primitive object={groupRef.current} />;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: { mode?: string; replyText?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 1.35, 2.2], fov: 22 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.35, 0)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <AvatarScene mode={mode} replyText={replyText} />
    </Canvas>
  );
}

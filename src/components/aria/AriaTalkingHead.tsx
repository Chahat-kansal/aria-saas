'use client';
import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { buildVisemes, Viseme } from './textToVisemes';

const MOUTH_MORPHS = ['aa','ih','ou','ee','oh'];

function setExpr(vrm: import('@pixiv/three-vrm').VRM, name: string, value: number) {
  vrm.expressionManager?.setValue(name, value);
}

function AvatarScene({ mode, replyText }: { mode: string; replyText: string }) {
  const vrmRef = useRef<import('@pixiv/three-vrm').VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const prevMode = useRef('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Load VRM
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser));
      loader.register(parser => new VRMAnimationLoaderPlugin(parser));

      const gltf = await loader.loadAsync('/models/Aria.glb');
      if (cancelled) return;
      const vrm = gltf.userData.vrm as import('@pixiv/three-vrm').VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      vrm.scene.rotation.y = Math.PI; // face camera
      vrmRef.current = vrm;

      // Load idle VRMA
      const animGltf = await loader.loadAsync('/models/idle.vrma');
      if (cancelled) return;
      const vrmAnim = animGltf.userData.vrmAnimations?.[0];
      if (vrmAnim) {
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;
        const clip = createVRMAnimationClip(vrmAnim, vrm);
        const action = mixer.clipAction(clip);
        action.play();
        idleActionRef.current = action;
      }
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

  useFrame((state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;

    mixerRef.current?.update(delta);
    vrm.update(delta);

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      setExpr(vrm, 'blink', 1);
      setTimeout(() => { setExpr(vrm, 'blink', 0); blinking.current = false; }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // Lip sync
    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      MOUTH_MORPHS.forEach(m => setExpr(vrm, m, 0));
      if (cur && cur.morph !== 'Fcl_MTH_Close') {
        // Map Fcl names to VRM expression names
        const exprMap: Record<string, string> = {
          'Fcl_MTH_A': 'aa', 'Fcl_MTH_I': 'ih', 'Fcl_MTH_U': 'ou',
          'Fcl_MTH_E': 'ee', 'Fcl_MTH_O': 'oh'
        };
        const expr = exprMap[cur.morph];
        if (expr) setExpr(vrm, expr, cur.value);
      }
      return;
    }
    MOUTH_MORPHS.forEach(m => setExpr(vrm, m, 0));
  });

  if (!vrmRef.current) return null;

  return <primitive object={vrmRef.current.scene} />;
}

function AvatarWithScene({ mode, replyText }: { mode: string; replyText: string }) {
  return <AvatarScene mode={mode} replyText={replyText} />;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: { mode?: string; replyText?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 1.4, 1.8], fov: 18 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.4, 0)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <Suspense fallback={null}>
        <AvatarWithScene mode={mode} replyText={replyText} />
      </Suspense>
    </Canvas>
  );
}

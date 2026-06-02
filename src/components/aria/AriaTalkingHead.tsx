'use client';
import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import { buildVisemes, Viseme } from './textToVisemes';

const EXPR_MAP: Record<string, string> = {
  'Fcl_MTH_A': 'aa', 'Fcl_MTH_I': 'ih', 'Fcl_MTH_U': 'ou',
  'Fcl_MTH_E': 'ee', 'Fcl_MTH_O': 'oh',
};

const BONES = {
  chest: 'J_Bip_C_Chest', upperChest: 'J_Bip_C_UpperChest',
  neck: 'J_Bip_C_Neck', head: 'J_Bip_C_Head', spine: 'J_Bip_C_Spine',
  lShoulder: 'J_Bip_L_Shoulder', rShoulder: 'J_Bip_R_Shoulder',
  lUpperArm: 'J_Bip_L_UpperArm', rUpperArm: 'J_Bip_R_UpperArm',
  lLowerArm: 'J_Bip_L_LowerArm', rLowerArm: 'J_Bip_R_LowerArm',
};

function AvatarScene({ mode, replyText }: { mode: string; replyText: string }) {
  const groupRef = useRef(new THREE.Group());
  const vrmRef = useRef<VRM | null>(null);
  const bonesRef = useRef<Record<string, THREE.Object3D>>({});
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const greetingDone = useRef(false);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const clock = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Loader 1: VRM only
      const vrmLoader = new GLTFLoader();
      vrmLoader.register(p => new VRMLoaderPlugin(p));
      const gltf = await vrmLoader.loadAsync('/models/Aria.glb');
      if (cancelled) return;

      const vrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      groupRef.current.add(vrm.scene);
      vrmRef.current = vrm;

      // Reset all expressions — override the angry default
      vrm.expressionManager?.setValue('angry', 0);
      vrm.expressionManager?.setValue('sad', 0);
      vrm.expressionManager?.setValue('neutral', 1);
      vrm.update(0);
      // Settle to relaxed/happy
      setTimeout(() => {
        vrm.expressionManager?.setValue('neutral', 0);
        vrm.expressionManager?.setValue('happy', 0.3);
      }, 100);

      // Cache bones
      const bones: Record<string, THREE.Object3D> = {};
      vrm.scene.traverse(obj => {
        Object.entries(BONES).forEach(([k, name]) => {
          if (obj.name === name) bones[k] = obj;
        });
      });
      bonesRef.current = bones;

      // Arms down: VRoid T-pose arms horizontal, z=-1.2 left / z=+1.2 right drops them
      if (bones.head) bones.head.rotation.x = 0.12; // chin up on load
      if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2;
      if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2;
      if (bones.lLowerArm) bones.lLowerArm.rotation.z = -0.2;
      if (bones.rLowerArm) bones.rLowerArm.rotation.z = 0.2;

      // Loader 2: VRMA only (separate loader, no conflict)
      try {
        const vrmaLoader = new GLTFLoader();
        vrmaLoader.register(p => new VRMAnimationLoaderPlugin(p));
        const a02 = await vrmaLoader.loadAsync('/models/VRMA_02.vrma');
        if (cancelled) return;

        const vrmaGreet = a02.userData.vrmAnimations?.[0];
        if (vrmaGreet) {
          const mixer = new THREE.AnimationMixer(vrm.scene);
          mixerRef.current = mixer;
          const clip = createVRMAnimationClip(vrmaGreet, vrm);
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.play();
          // Use timeout — 'finished' event unreliable with LoopOnce
          // Start fading at 5.5s (before animation ends at 7.27s) over 3s
          setTimeout(() => {
            greetingDone.current = true;
            mixerRef.current = null;
            if (bones.head) { bones.head.rotation.set(0, 0, 0); }
            if (bones.neck) { bones.neck.rotation.set(-0.08, 0, 0); }
            if (bones.chest) { bones.chest.rotation.set(-0.05, 0, 0); }
            if (bones.spine) { bones.spine.rotation.set(-0.03, 0, 0); }
            if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2;
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2;
          }, 7267);
        } else {
          greetingDone.current = true;
        }
      } catch { greetingDone.current = true; }
    }

    load().catch(() => { greetingDone.current = true; });
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

    // Run greeting mixer
    if (mixerRef.current) {
      mixerRef.current.update(delta);
      vrm.update(delta);
      return;
    }

    clock.current += delta;
    const t = clock.current;
    vrm.update(delta);
    const bones = bonesRef.current;

    // Breathing
    if (bones.chest) bones.chest.rotation.x = Math.sin(t * 0.8) * 0.012;
    if (bones.spine) bones.spine.rotation.x = Math.sin(t * 0.8) * 0.008;

    // Head sway
    if (bones.head) {
      bones.head.rotation.y = Math.sin(t * 0.3) * 0.06;
      bones.head.rotation.x = 0 + Math.sin(t * 0.25) * 0.02;
    }
    if (bones.neck) {
      bones.neck.rotation.y = Math.sin(t * 0.3) * 0.03;
      bones.neck.rotation.x = -0.08;
    }

    // Arms breathing
    if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2 + Math.sin(t * 0.8) * 0.015;
    if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2 - Math.sin(t * 0.8) * 0.015;

    // Talking — more movement
    if (mode === 'talking' && bones.head) {
      bones.head.rotation.y += Math.sin(t * 2.5) * 0.02;
      bones.head.rotation.x += Math.sin(t * 1.8) * 0.01;
    }

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      vrm.expressionManager?.setValue('blink', 1);
      setTimeout(() => { vrm.expressionManager?.setValue('blink', 0); blinking.current = false; }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // Soft smile
    vrm.expressionManager?.setValue('happy', mode === 'talking' ? 0.4 : 0.25);

    // Lip sync
    ['aa','ih','ou','ee','oh'].forEach(e => vrm.expressionManager?.setValue(e, 0));
    if (mode === 'talking' && talkStart.current !== null) {
      const elapsed = (performance.now() - talkStart.current) / 1000;
      const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
      if (cur && cur.morph !== 'Fcl_MTH_Close') {
        const expr = EXPR_MAP[cur.morph];
        if (expr) vrm.expressionManager?.setValue(expr, cur.value);
      }
    }
  });

  return <primitive object={groupRef.current} />;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: { mode?: string; replyText?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 1.38, 2.6], fov: 32 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.3, 0)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <AvatarScene mode={mode} replyText={replyText} />
    </Canvas>
  );
}

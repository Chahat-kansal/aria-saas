'use client';
import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from '@pixiv/three-vrm';
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

// VRoid J_Bip bone names for procedural animation
const BONES = {
  chest:      'J_Bip_C_Chest',
  upperChest: 'J_Bip_C_UpperChest',
  neck:       'J_Bip_C_Neck',
  head:       'J_Bip_C_Head',
  lShoulder:  'J_Bip_L_Shoulder',
  rShoulder:  'J_Bip_R_Shoulder',
  lUpperArm:  'J_Bip_L_UpperArm',
  rUpperArm:  'J_Bip_R_UpperArm',
  lLowerArm:  'J_Bip_L_LowerArm',
  rLowerArm:  'J_Bip_R_LowerArm',
  spine:      'J_Bip_C_Spine',
};

function AvatarScene({ mode, replyText }: { mode: string; replyText: string }) {
  const groupRef = useRef(new THREE.Group());
  const vrmRef = useRef<VRM | null>(null);
  const bonesRef = useRef<Record<string, THREE.Object3D>>({});
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const clock = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const loader = new GLTFLoader();
      loader.register(p => new VRMLoaderPlugin(p));
      const gltf = await loader.loadAsync('/models/Aria.glb');
      if (cancelled) return;

      const vrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      groupRef.current.add(vrm.scene);
      vrmRef.current = vrm;

      // Cache bone references
      const bones: Record<string, THREE.Object3D> = {};
      vrm.scene.traverse(obj => {
        Object.entries(BONES).forEach(([key, name]) => {
          if (obj.name === name) bones[key] = obj;
        });
      });
      bonesRef.current = bones;

      // VRoid T-pose: arms horizontal at z=0. Bring arms DOWN:
      // Left arm: z goes negative to drop down
      // Right arm: z goes positive to drop down
      if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2;
      if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2;
      if (bones.lLowerArm) bones.lLowerArm.rotation.z = -0.2;
      if (bones.rLowerArm) bones.rLowerArm.rotation.z = 0.2;
      if (bones.lShoulder)  bones.lShoulder.rotation.z = -0.05;
      if (bones.rShoulder)  bones.rShoulder.rotation.z = 0.05;
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
    vrm.update(delta);
    clock.current += delta;
    const t = clock.current;
    const bones = bonesRef.current;

    // ── Procedural idle animation ────────────────────────────────────────────
    // Breathing — chest rises and falls
    if (bones.chest) {
      bones.chest.rotation.x = Math.sin(t * 0.8) * 0.012;
    }
    if (bones.upperChest) {
      bones.upperChest.rotation.x = Math.sin(t * 0.8 + 0.2) * 0.010;
    }
    if (bones.spine) {
      bones.spine.rotation.x = Math.sin(t * 0.8) * 0.008;
    }

    // Subtle body sway
    if (bones.chest) {
      bones.chest.rotation.z = Math.sin(t * 0.4) * 0.008;
    }

    // Head gentle look-around
    if (bones.head) {
      bones.head.rotation.y = Math.sin(t * 0.3) * 0.06;
      bones.head.rotation.x = -0.05 + Math.sin(t * 0.25) * 0.02;
      bones.head.rotation.z = Math.sin(t * 0.35) * 0.015;
    }
    if (bones.neck) {
      bones.neck.rotation.y = Math.sin(t * 0.3) * 0.03;
    }

    // Arms gentle swing with breathing
    if (bones.lUpperArm) {
      bones.lUpperArm.rotation.z = -1.2 + Math.sin(t * 0.8) * 0.015;
      bones.lUpperArm.rotation.x = Math.sin(t * 0.4) * 0.01;
    }
    if (bones.rUpperArm) {
      bones.rUpperArm.rotation.z = 1.2 - Math.sin(t * 0.8) * 0.015;
      bones.rUpperArm.rotation.x = Math.sin(t * 0.4 + 0.3) * 0.01;
    }

    // Talking — more expressive head movement
    if (mode === 'talking') {
      if (bones.head) {
        bones.head.rotation.y += Math.sin(t * 2.5) * 0.025;
        bones.head.rotation.x += Math.sin(t * 1.8) * 0.015;
      }
      if (bones.lUpperArm) {
        bones.lUpperArm.rotation.x += Math.sin(t * 1.5) * 0.03;
      }
      if (bones.rUpperArm) {
        bones.rUpperArm.rotation.x += Math.sin(t * 1.5 + 1) * 0.03;
      }
    }

    // ── Blink ────────────────────────────────────────────────────────────────
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

    // ── Lip sync ─────────────────────────────────────────────────────────────
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

  return <primitive object={groupRef.current} />;
}

export default function AriaTalkingHead({ mode = 'idle', replyText = '' }: { mode?: string; replyText?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 1.38, 2.2], fov: 20 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 1.38, 0)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <AvatarScene mode={mode} replyText={replyText} />
    </Canvas>
  );
}

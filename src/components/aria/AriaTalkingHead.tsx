'use client';
import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildVisemes, Viseme } from './textToVisemes';

const ANIMATIONS_URL = 'https://raw.githubusercontent.com/Yacine-Mekideche/IAcine-Virtual-Avatar/main/front/public/models/animations.glb';
const MOUTH_MORPHS = ['Fcl_MTH_A','Fcl_MTH_I','Fcl_MTH_U','Fcl_MTH_E','Fcl_MTH_O','Fcl_MTH_Close'];

// Maps IAcine bone names → VRoid J_Bip bone names
const BONE_MAP: Record<string, string> = {
  'Hips':             'J_Bip_C_Hips',
  'Spine':            'J_Bip_C_Spine',
  'Spine1':           'J_Bip_C_Chest',
  'Spine2':           'J_Bip_C_UpperChest',
  'Neck':             'J_Bip_C_Neck',
  'Head':             'J_Bip_C_Head',
  'LeftShoulder':     'J_Bip_L_Shoulder',
  'LeftArm':          'J_Bip_L_UpperArm',
  'LeftForeArm':      'J_Bip_L_LowerArm',
  'LeftHand':         'J_Bip_L_Hand',
  'RightShoulder':    'J_Bip_R_Shoulder',
  'RightArm':         'J_Bip_R_UpperArm',
  'RightForeArm':     'J_Bip_R_LowerArm',
  'RightHand':        'J_Bip_R_Hand',
  'LeftUpLeg':        'J_Bip_L_UpperLeg',
  'LeftLeg':          'J_Bip_L_LowerLeg',
  'LeftFoot':         'J_Bip_L_Foot',
  'LeftToeBase':      'J_Bip_L_ToeBase',
  'RightUpLeg':       'J_Bip_R_UpperLeg',
  'RightLeg':         'J_Bip_R_LowerLeg',
  'RightFoot':        'J_Bip_R_Foot',
  'RightToeBase':     'J_Bip_R_ToeBase',
  'LeftHandIndex1':   'J_Bip_L_Index1',
  'LeftHandIndex2':   'J_Bip_L_Index2',
  'LeftHandIndex3':   'J_Bip_L_Index3',
  'RightHandIndex1':  'J_Bip_R_Index1',
  'RightHandIndex2':  'J_Bip_R_Index2',
  'RightHandIndex3':  'J_Bip_R_Index3',
  'LeftHandThumb1':   'J_Bip_L_Thumb1',
  'LeftHandThumb2':   'J_Bip_L_Thumb2',
  'LeftHandThumb3':   'J_Bip_L_Thumb3',
  'RightHandThumb1':  'J_Bip_R_Thumb1',
  'RightHandThumb2':  'J_Bip_R_Thumb2',
  'RightHandThumb3':  'J_Bip_R_Thumb3',
};

function setMorph(meshes: THREE.Mesh[], name: string, value: number) {
  for (const m of meshes) {
    if (!m.morphTargetDictionary || !m.morphTargetInfluences) continue;
    const i = m.morphTargetDictionary[name];
    if (i !== undefined) m.morphTargetInfluences[i] = value;
  }
}

function retargetAnimation(clip: THREE.AnimationClip, ariaScene: THREE.Object3D): THREE.AnimationClip {
  // Build a map of Aria bone name → bone object
  const ariaBones: Record<string, THREE.Object3D> = {};
  ariaScene.traverse(obj => { ariaBones[obj.name] = obj; });

  const newTracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    // track.name is like "Head.quaternion" or "LeftArm.position"
    const dotIdx = track.name.indexOf('.');
    const iacinebone = track.name.slice(0, dotIdx);
    const prop = track.name.slice(dotIdx);
    const ariaBoneName = BONE_MAP[iacinebone];
    if (ariaBoneName && ariaBones[ariaBoneName]) {
      const newTrack = track.clone();
      newTrack.name = ariaBoneName + prop;
      newTracks.push(newTrack);
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

function AvatarScene({ mode, replyText }: { mode: string; replyText: string }) {
  const { scene } = useGLTF('/models/Aria.glb');
  const { animations } = useGLTF(ANIMATIONS_URL);

  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const currentAction = useRef<THREE.AnimationAction | null>(null);
  const faceMeshes = useRef<THREE.Mesh[]>([]);
  const visemes = useRef<Viseme[]>([]);
  const talkStart = useRef<number | null>(null);
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const ready = useRef(false);
  const prevMode = useRef('');

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

    // Set up mixer and play Idle
    const m = new THREE.AnimationMixer(scene);
    mixer.current = m;

    if (animations.length > 0) {
      const idleClip = animations.find(a => a.name === 'Idle') ?? animations[0];
      const retargeted = retargetAnimation(idleClip, scene);
      const action = m.clipAction(retargeted);
      action.reset().fadeIn(0.3).play();
      currentAction.current = action;
    }

    return () => { m.stopAllAction(); };
  }, [scene, animations]);

  // Switch animation on mode change
  useEffect(() => {
    if (!mixer.current || !animations.length) return;
    if (mode === prevMode.current) return;
    prevMode.current = mode;

    const clipName = mode === 'talking' ? 'Talking_0' : 'Idle';
    const clip = animations.find(a => a.name === clipName) ?? animations.find(a => a.name === 'Idle') ?? animations[0];
    const retargeted = retargetAnimation(clip, scene);
    const newAction = mixer.current.clipAction(retargeted);

    if (currentAction.current && currentAction.current !== newAction) {
      currentAction.current.fadeOut(0.4);
    }
    newAction.reset().fadeIn(0.4).play();
    currentAction.current = newAction;
  }, [mode, animations, scene]);

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
    mixer.current?.update(delta);
    const meshes = faceMeshes.current;

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      setMorph(meshes, 'Fcl_EYE_Close', 1);
      setTimeout(() => { setMorph(meshes, 'Fcl_EYE_Close', 0); blinking.current = false; }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
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

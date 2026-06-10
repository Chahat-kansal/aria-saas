'use client';
import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import { buildVisemes, Viseme } from './textToVisemes';
import { initVoice, speakAriaText, stopAriaSpeech, onSpeakStart, onSpeakEnd } from '@/lib/aria/headTTSBridge';
import type { VisemeEntry } from '@/lib/aria/headTTSBridge';

// Greeting plays once per browser session — prevents re-wave on React remounts
let _greetingPlayedThisSession = false;

// ── VRoid blendshape ↔ Oculus viseme map ─────────────────────────────────
// Used when HeadTTS WebGPU returns Oculus viseme IDs.
// Character-based textToVisemes uses the same VRoid morph names directly.
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

// ── Mood → VRM expression map ─────────────────────────────────────────────
const MOOD_EXPR: Record<string, { expr: string; value: number }> = {
  happy:     { expr: 'happy',     value: 0.7 },
  excited:   { expr: 'surprised', value: 0.5 },
  concerned: { expr: 'sad',       value: 0.4 },
  thinking:  { expr: 'neutral',   value: 0.0 },
  neutral:   { expr: 'neutral',   value: 0.0 },
}

// ── Mood → gesture-set rotation (Part 3) ─────────────────────────────────
const GESTURE_SETS: Record<string, string[]> = {
  happy:     ['side', 'handup', 'ok'],
  excited:   ['handup', 'thumbup', 'side'],
  concerned: ['shrug', 'side'],
  thinking:  ['index', 'side'],
  neutral:   ['side', 'index'],
}

function AvatarScene({ mode, replyText, mood, gesture }: {
  mode: string; replyText: string; mood: string; gesture: string
}) {
  const groupRef = useRef(new THREE.Group());
  const vrmRef = useRef<VRM | null>(null);
  const vrmReadyRef = useRef(false);
  const frameErrorRef = useRef(false);
  const bonesRef = useRef<Record<string, THREE.Object3D>>({});
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleActionRef  = useRef<THREE.AnimationAction | null>(null);
  const talkActionRef  = useRef<THREE.AnimationAction | null>(null);
  const mixerStateRef  = useRef<'greeting' | 'idle' | 'talk'>('greeting');
  const greetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetingDone = useRef(false);

  // ── Viseme state — supports both character-based and HeadTTS Oculus visemes
  const visemes = useRef<Viseme[]>([]);          // character-based (fallback)
  const htVisemes = useRef<VisemeEntry[]>([]);   // HeadTTS Oculus visemes (preferred)
  const talkStart = useRef<number | null>(null);
  const useHtVisemes = useRef(false);

  // ── Mood + gesture state ──────────────────────────────────────────────────
  const moodRef       = useRef<string>('neutral');
  const gestureRef    = useRef<{ name: string; end: number; mirrorLeft: boolean } | null>(null);
  const gestureIdxRef = useRef(0);  // rotates through GESTURE_SETS per mood

  // Scheduled timers for sentence-timed gestures + head nods (Part 3)
  const gestureTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const headNodEndRef    = useRef<number>(0);  // ms timestamp when active nod ends

  const unsubSpeakStartRef = useRef<(() => void) | null>(null);
  const unsubSpeakEndRef   = useRef<(() => void) | null>(null);

  const lastSpokenRef = useRef<string>('');
  const pendingGestureRef = useRef<string>('');
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const clock = useRef(0);

  // ── Init HeadTTS voice backend (runs once, client-only) ──────────────────
  useEffect(() => {
    initVoice()
  }, [])

  // ── Mood: update ref + apply expression immediately if VRM is ready ──────
  useEffect(() => {
    moodRef.current = mood
    const vrm = vrmRef.current
    if (!vrm || !vrmReadyRef.current) return
    const def = MOOD_EXPR[mood] ?? MOOD_EXPR.neutral
    // Reset all mood-driven expressions before applying new one
    vrm.expressionManager?.setValue('sad', 0)
    vrm.expressionManager?.setValue('surprised', 0)
    if (def.expr !== 'neutral' && def.value > 0) {
      vrm.expressionManager?.setValue(def.expr, def.value)
    }
  }, [mood])

  // ── Gesture: store prop-driven gesture as a hint for the next speech start.
  // Sentence-timed gestures (Part 3) fire automatically; this handles explicit
  // [gesture:X] tags from the AI response as a one-shot override.
  useEffect(() => {
    if (!gesture) return
    if (vrmReadyRef.current && talkStart.current !== null) {
      console.log(`[AriaGesture] firing ${gesture} (immediate — speech active)`)
      gestureRef.current = { name: gesture, end: Date.now() + 3500, mirrorLeft: Math.random() > 0.5 }
    } else {
      pendingGestureRef.current = gesture
    }
  }, [gesture])

  // ── VRM load (unchanged from original) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const vrmLoader = new GLTFLoader();
      vrmLoader.register(p => new VRMLoaderPlugin(p));
      const gltf = await vrmLoader.loadAsync('/models/Aria.glb');
      if (cancelled) return;

      const vrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      groupRef.current.add(vrm.scene);
      vrmRef.current = vrm;

      vrm.expressionManager?.setValue('angry', 0);
      vrm.expressionManager?.setValue('sad', 0);
      vrm.expressionManager?.setValue('neutral', 1);
      vrm.update(0);
      setTimeout(() => {
        vrm.expressionManager?.setValue('neutral', 0);
        vrm.expressionManager?.setValue('happy', 0.3);
      }, 100);

      const bones: Record<string, THREE.Object3D> = {};
      vrm.scene.traverse(obj => {
        Object.entries(BONES).forEach(([k, name]) => {
          if (obj.name === name) bones[k] = obj;
        });
      });
      bonesRef.current = bones;

      if (bones.head) bones.head.rotation.x = 0.12;
      if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2;
      if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2;
      if (bones.lLowerArm) bones.lLowerArm.rotation.z = -0.2;
      if (bones.rLowerArm) bones.rLowerArm.rotation.z = 0.2;

      vrmReadyRef.current = true;

      // ── Persistent mixer — lives for the avatar's lifetime ───────────────
      const mixer = new THREE.AnimationMixer(vrm.scene);
      mixerRef.current = mixer;

      const aLoader = () => { const l = new GLTFLoader(); l.register(p => new VRMAnimationLoaderPlugin(p)); return l; };
      const [greetRes, idleRes, talkRes] = await Promise.allSettled([
        aLoader().loadAsync('/models/VRMA_02.vrma'),
        aLoader().loadAsync('/models/idle.vrma'),
        aLoader().loadAsync('/models/VRMA_01.vrma'),
      ]);
      if (cancelled) return;

      // ── Idle base loop ────────────────────────────────────────────────────
      let idleVrma: import('@pixiv/three-vrm-animation').VRMAnimation | undefined;
      if (idleRes.status === 'fulfilled') {
        idleVrma = idleRes.value.userData.vrmAnimations?.[0];
        if (idleVrma) {
          const idleClip = createVRMAnimationClip(idleVrma, vrm);
          const idleAction = mixer.clipAction(idleClip);
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          idleActionRef.current = idleAction;
          console.log(`[AriaTalkingHead] idle.vrma loaded (${idleClip.tracks.length} tracks)`);
        }
      } else {
        console.warn('[AriaTalkingHead] idle.vrma missing — manual sway active');
      }

      // ── Talk animation (VRMA_01 if substantial; else idle@1.15×) ─────────
      if (talkRes.status === 'fulfilled') {
        const talkVrma = talkRes.value.userData.vrmAnimations?.[0];
        if (talkVrma) {
          const talkClip = createVRMAnimationClip(talkVrma, vrm);
          if (talkClip.tracks.length > 2) {
            const talkAction = mixer.clipAction(talkClip);
            talkAction.setLoop(THREE.LoopRepeat, Infinity);
            talkActionRef.current = talkAction;
            console.log(`[AriaTalkingHead] VRMA_01 → TALK (${talkClip.tracks.length} tracks)`);
          }
        }
      }
      if (!talkActionRef.current && idleVrma) {
        // Reuse idle at 1.15× as a slightly more energetic talk loop
        const talkFastClip = createVRMAnimationClip(idleVrma, vrm);
        const talkAction = mixer.clipAction(talkFastClip);
        talkAction.setLoop(THREE.LoopRepeat, Infinity);
        talkAction.timeScale = 1.15;
        talkActionRef.current = talkAction;
        console.log('[AriaTalkingHead] idle@1.15× → TALK');
      }

      // ── Wire mixer crossfades to speech events ────────────────────────────
      unsubSpeakStartRef.current?.();
      unsubSpeakStartRef.current = onSpeakStart(() => {
        if (!talkActionRef.current || !idleActionRef.current) return;
        if (mixerStateRef.current === 'talk' || mixerStateRef.current === 'greeting') return;
        talkActionRef.current.reset();
        idleActionRef.current.crossFadeTo(talkActionRef.current, 0.4, true);
        talkActionRef.current.play();
        mixerStateRef.current = 'talk';
      });
      unsubSpeakEndRef.current?.();
      unsubSpeakEndRef.current = onSpeakEnd(() => {
        if (!idleActionRef.current || !talkActionRef.current) return;
        if (mixerStateRef.current !== 'talk') return;
        idleActionRef.current.reset();
        talkActionRef.current.crossFadeTo(idleActionRef.current, 0.6, true);
        idleActionRef.current.play();
        mixerStateRef.current = 'idle';
      });

      // ── Greeting clip → crossfade to idle ────────────────────────────────
      const startIdle = () => {
        greetingDone.current = true;
        if (idleActionRef.current) {
          idleActionRef.current.play();
          mixerStateRef.current = 'idle';
        } else {
          // No idle.vrma — null mixer, fall back to manual sway
          mixerRef.current = null;
          mixerStateRef.current = 'idle';
          if (bones.head) bones.head.rotation.set(0, 0, 0);
          if (bones.neck) bones.neck.rotation.set(-0.08, 0, 0);
          if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2;
          if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2;
        }
      };

      if (!_greetingPlayedThisSession && greetRes.status === 'fulfilled') {
        const vrmaGreet = greetRes.value.userData.vrmAnimations?.[0];
        if (vrmaGreet) {
          _greetingPlayedThisSession = true;
          const greetClip = createVRMAnimationClip(vrmaGreet, vrm);
          const greetAction = mixer.clipAction(greetClip);
          greetAction.setLoop(THREE.LoopOnce, 1);
          greetAction.play();
          greetTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            if (idleActionRef.current) {
              idleActionRef.current.reset();
              greetAction.crossFadeTo(idleActionRef.current, 0.5, true);
            }
            startIdle();
            console.log('[AriaTalkingHead] greeting → idle crossfade');
          }, 7267);
        } else {
          startIdle();
        }
      } else {
        startIdle();
      }
    }

    load().catch(() => { greetingDone.current = true; });
    return () => {
      cancelled = true;
      if (greetTimeoutRef.current) { clearTimeout(greetTimeoutRef.current); greetTimeoutRef.current = null; }
      gestureTimersRef.current.forEach(clearTimeout);
      gestureTimersRef.current = [];
      unsubSpeakStartRef.current?.(); unsubSpeakStartRef.current = null;
      unsubSpeakEndRef.current?.();   unsubSpeakEndRef.current   = null;
      vrmReadyRef.current = false;
      frameErrorRef.current = false;
      stopAriaSpeech();
    };
  }, []);

  // ── Speech + viseme trigger: fires when replyText changes ─────────────
  useEffect(() => {
    // Clear gesture schedule on reply clear
    if (!replyText) {
      lastSpokenRef.current = '';
      talkStart.current = null;
      visemes.current = [];
      htVisemes.current = [];
      useHtVisemes.current = false;
      pendingGestureRef.current = '';
      gestureTimersRef.current.forEach(clearTimeout);
      gestureTimersRef.current = [];
      return;
    }

    // Guard: don't re-speak the same text (React StrictMode double-fires effects)
    if (replyText === lastSpokenRef.current) return;
    lastSpokenRef.current = replyText;

    try {
      speakAriaText(replyText, (schedule, startMs) => {
        try {
          if (schedule && schedule.length > 0) {
            htVisemes.current = schedule;
            useHtVisemes.current = true;
          } else {
            visemes.current = buildVisemes(replyText);
            useHtVisemes.current = false;
          }

          const isFirst = talkStart.current === null;
          talkStart.current = startMs;

          if (isFirst) {
            // ── Fire prop-driven gesture hint ────────────────────────────────
            if (pendingGestureRef.current) {
              const gName = pendingGestureRef.current;
              pendingGestureRef.current = '';
              console.log(`[AriaGesture] firing ${gName} (speech-start)`);
              gestureRef.current = { name: gName, end: Date.now() + 3500, mirrorLeft: Math.random() > 0.5 };
            }

            // ── Schedule sentence-timed gestures + head nods (Part 3) ────────
            gestureTimersRef.current.forEach(clearTimeout);
            gestureTimersRef.current = [];
            gestureIdxRef.current = 0;

            const sentences = replyText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3);
            let charOffset = 0;
            sentences.forEach((sentence, i) => {
              const msFromStart = charOffset * 60;  // ~60 ms/char matches TTS speech rate
              charOffset += sentence.length + 1;

              if (i > 0) {
                const nodDelay = Math.max(100, (startMs - Date.now()) + msFromStart - 150);
                const nodTimer = setTimeout(() => {
                  headNodEndRef.current = Date.now() + 280;
                }, nodDelay);
                gestureTimersRef.current.push(nodTimer);
              }

              const fireGesture = (i % 2 === 0) || (Math.random() > 0.6);
              if (fireGesture) {
                const mood = moodRef.current;
                const set = GESTURE_SETS[mood] ?? GESTURE_SETS.neutral;
                const gIdx = gestureIdxRef.current % set.length;
                gestureIdxRef.current++;
                const gName = set[gIdx];
                const mirrorLeft = Math.random() > 0.5;

                const gDelay = Math.max(200, (startMs - Date.now()) + msFromStart + 200);
                const gTimer = setTimeout(() => {
                  console.log(`[AriaGesture] firing ${gName} (sentence ${i}, mirror=${mirrorLeft})`);
                  gestureRef.current = { name: gName, end: Date.now() + 3000, mirrorLeft };
                }, gDelay);
                gestureTimersRef.current.push(gTimer);
              }
            });
          }
        } catch (e) {
          console.error('[AriaTalkingHead] speak schedule callback error', e);
        }
      });
    } catch (e) {
      console.error('[AriaTalkingHead] speakAriaText error', e);
    }
  }, [replyText]);

  // ── Frame loop (unchanged idle/talk/blink logic; lip-sync extended) ─────
  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !vrmReadyRef.current) return;
    try {

    // Mixer runs for avatar's full lifetime (idle/talk clips + greeting)
    if (mixerRef.current) mixerRef.current.update(delta);

    clock.current += delta;
    const t = clock.current;
    vrm.update(delta);
    const bones = bonesRef.current;

    // Manual breathing only when no idle animation provides it via mixer.
    // Decision: REMOVE when idle.vrma loaded; keep as fallback otherwise.
    if (!idleActionRef.current) {
      if (bones.chest) bones.chest.rotation.x = Math.sin(t * 0.8) * 0.012;
      if (bones.spine) bones.spine.rotation.x = Math.sin(t * 0.8) * 0.008;
    }

    // Head sway
    if (bones.head) {
      bones.head.rotation.y = Math.sin(t * 0.3) * 0.06;
      bones.head.rotation.x = 0 + Math.sin(t * 0.25) * 0.02;
    }
    if (bones.neck) {
      bones.neck.rotation.y = Math.sin(t * 0.3) * 0.03;
      bones.neck.rotation.x = -0.08;
    }

    // Arms: breathing unless a gesture is active
    if (!gestureRef.current) {
      if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2 + Math.sin(t * 0.8) * 0.015;
      if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2 - Math.sin(t * 0.8) * 0.015;
    }

    // Gesture arm override — supports mirrorLeft for natural L/R alternation
    if (gestureRef.current) {
      const { name, end, mirrorLeft } = gestureRef.current
      const remaining = end - Date.now()
      // Bone aliases based on mirror flag
      const ua  = mirrorLeft ? bones.lUpperArm : bones.rUpperArm
      const la  = mirrorLeft ? bones.lLowerArm : bones.rLowerArm
      const uaZ_rest = mirrorLeft ? -1.2 : 1.2
      const uaZ_sign = mirrorLeft ? -1 : 1   // lerp targets flip sign for left arm
      if (remaining <= 0) {
        gestureRef.current = null
        if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2
        if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2
        if (bones.rLowerArm) bones.rLowerArm.rotation.x = 0.0
        if (bones.lLowerArm) bones.lLowerArm.rotation.x = 0.0
        if (bones.rUpperArm) bones.rUpperArm.rotation.x = 0.0
        if (bones.lUpperArm) bones.lUpperArm.rotation.x = 0.0
      } else {
        const total = 3000
        const elapsed = total - remaining
        const easeIn  = Math.min(1, elapsed / 400)
        const easeOut = Math.min(1, remaining / 400)
        const blend   = easeIn * easeOut
        switch (name) {
          case 'handup':
          case 'thumbup':
            if (ua) ua.rotation.z = THREE.MathUtils.lerp(uaZ_rest, uaZ_sign * 0.35, blend)
            if (la) la.rotation.x = THREE.MathUtils.lerp(0, -0.4, blend)
            break
          case 'shrug':
            if (bones.lUpperArm) bones.lUpperArm.rotation.z = THREE.MathUtils.lerp(-1.2, -0.8, blend)
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = THREE.MathUtils.lerp(1.2, 0.8, blend)
            break
          case 'index':
            if (ua) ua.rotation.x = THREE.MathUtils.lerp(0, -0.35, blend)
            if (ua) ua.rotation.z = THREE.MathUtils.lerp(uaZ_rest, uaZ_sign * 0.6, blend)
            break
          default: // side, ok
            if (ua) ua.rotation.z = THREE.MathUtils.lerp(uaZ_rest, uaZ_sign * 0.55, blend)
            break
        }
      }
    }

    // Head nod pulses at sentence boundaries
    const nodNow = Date.now()
    if (headNodEndRef.current > nodNow && bones.head) {
      const nodProgress = 1 - (headNodEndRef.current - nodNow) / 280
      // Quick dip-and-recover (sin arch)
      const nodAmt = Math.sin(nodProgress * Math.PI) * 0.06
      bones.head.rotation.x += nodAmt
    }

    // Talking — more head movement
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

    // Mood-aware smile (mood prop overrides default idle smile)
    const curMood = moodRef.current
    const moodSmile = (curMood === 'happy' || curMood === 'excited')
      ? 0.7
      : curMood === 'concerned'
        ? 0.05
        : (mode === 'talking' || talkStart.current !== null ? 0.4 : 0.25)
    vrm.expressionManager?.setValue('happy', moodSmile);
    vrm.expressionManager?.setValue('sad',       curMood === 'concerned' ? 0.4 : 0);
    vrm.expressionManager?.setValue('surprised',  curMood === 'excited'   ? 0.4 : 0);

    // ── Lip sync ─────────────────────────────────────────────────────────
    // Reset all mouth morphs
    ['aa','ih','ou','ee','oh'].forEach(e => vrm.expressionManager?.setValue(e, 0));

    if (talkStart.current !== null) {
      const elapsed = (Date.now() - talkStart.current) / 1000;

      if (useHtVisemes.current && htVisemes.current.length > 0) {
        // ── HeadTTS Oculus visemes (WebGPU path) ─────────────────────────
        const cur = htVisemes.current.find(v => elapsed >= v.start && elapsed < v.end);
        if (cur && cur.morph) {
          vrm.expressionManager?.setValue(cur.morph, cur.value);
        }
      } else if (visemes.current.length > 0) {
        // ── Character-based visemes (fallback) ────────────────────────────
        const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
        if (cur && cur.morph !== 'Fcl_MTH_Close') {
          const expr = EXPR_MAP[cur.morph];
          if (expr) vrm.expressionManager?.setValue(expr, cur.value);
        }
      }

      // Safety fallback: close lips if viseme schedule ended long ago with no onSpeakEnd signal.
      // onSpeakEnd (source.ended) is authoritative — this only fires in error/hang cases.
      const maxEnd = useHtVisemes.current
        ? (htVisemes.current[htVisemes.current.length - 1]?.end ?? 0)
        : (visemes.current[visemes.current.length - 1]?.end ?? 0);
      if (elapsed > maxEnd + 5.0) {
        talkStart.current = null;
      }
    }

    } catch (e) {
      if (!frameErrorRef.current) {
        frameErrorRef.current = true;
        console.error('[AriaTalkingHead] frame error (suppressed after first):', e instanceof Error ? e.message : e);
      }
    }
  });

  return <primitive object={groupRef.current} />;
}

export default function AriaTalkingHead({
  mode = 'idle', replyText = '', mood = 'neutral', gesture = '',
}: {
  mode?: string; replyText?: string; mood?: string; gesture?: string
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.1, 1.8], fov: 30 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 1.2, 0)
        gl.setClearColor(0x000000, 0) // transparent canvas background
        gl.domElement.addEventListener('webglcontextlost', (e: Event) => {
          e.preventDefault()
          console.warn('[AriaTalkingHead] WebGL context lost — will restore when available')
        }, false)
        gl.domElement.addEventListener('webglcontextrestored', () => {
          console.log('[AriaTalkingHead] WebGL context restored')
        }, false)
      }}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <AvatarScene mode={mode} replyText={replyText} mood={mood} gesture={gesture} />
    </Canvas>
  );
}

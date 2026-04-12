'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface Props {
  onTranscript: (text: string) => void;  // called when user finishes speaking
  isSpeaking: boolean;                    // true when Aria is reading aloud
  onStopSpeaking: () => void;
  lastAiMessage?: string;                 // auto-read this when it arrives
  autoRead?: boolean;
}

export function VoiceMode({ onTranscript, isSpeaking, onStopSpeaking, lastAiMessage, autoRead = false }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    const hasSpeechSynthesis = 'speechSynthesis' in window;
    setSupported(hasSpeechRecognition && hasSpeechSynthesis);
    if (hasSpeechSynthesis) synthRef.current = window.speechSynthesis;
  }, []);

  // Auto-read AI responses when voiceEnabled + autoRead
  useEffect(() => {
    if (lastAiMessage && voiceEnabled && autoRead && !isSpeaking) {
      speak(lastAiMessage);
    }
  }, [lastAiMessage]);

  function startListening() {
    if (!supported) { toast.error('Speech recognition not supported in this browser. Use Chrome or Edge.'); return; }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      if (transcript.trim()) {
        onTranscript(transcript.trim());
        setTranscript('');
      }
    };
    recognition.onerror = (e: any) => {
      setListening(false);
      if (e.error !== 'no-speech') toast.error(`Mic error: ${e.error}`);
    };
    recognition.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript(final || interim);
      if (final) {
        recognition.stop();
        onTranscript(final.trim());
        setTranscript('');
      }
    };

    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function speak(text: string) {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    // Clean markdown for speech
    const cleaned = text
      .replace(/```[\s\S]*?```/g, 'code block')
      .replace(/`[^`]+`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/---/g, '')
      .trim()
      .slice(0, 2000); // Max 2000 chars for TTS

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utteranceRef.current = utterance;

    // Pick a good voice
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Samantha') ||
      v.name.includes('Karen') ||
      v.name.includes('Daniel') ||
      (v.lang === 'en-US' && v.localService)
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => onStopSpeaking();
    utterance.onerror = () => onStopSpeaking();

    synthRef.current.speak(utterance);
  }

  function stopSpeaking() {
    synthRef.current?.cancel();
    onStopSpeaking();
  }

  function toggleVoice() {
    if (!supported) {
      toast.error('Voice not supported. Use Chrome or Edge.');
      return;
    }
    setVoiceEnabled(v => {
      if (v) stopSpeaking();
      return !v;
    });
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Voice toggle */}
      <button
        onClick={toggleVoice}
        title={voiceEnabled ? 'Disable voice mode' : 'Enable voice mode'}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
          voiceEnabled
            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
            : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'
        }`}
      >
        🎤 Voice {voiceEnabled ? 'on' : 'off'}
      </button>

      {voiceEnabled && (
        <>
          {/* Mic button */}
          {isSpeaking ? (
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-blue-500/50 bg-blue-500/20 text-blue-300 animate-pulse"
            >
              🔊 Stop
            </button>
          ) : (
            <button
              onClick={listening ? stopListening : startListening}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                listening
                  ? 'border-red-500/50 bg-red-500/20 text-red-300 animate-pulse'
                  : 'border-green-500/50 bg-green-500/20 text-green-300 hover:bg-green-500/30'
              }`}
            >
              {listening ? '⏹ Stop' : '🎙 Speak'}
            </button>
          )}

          {/* Live transcript */}
          {transcript && (
            <span className="text-xs text-[#888899] italic truncate max-w-[160px]">
              "{transcript}"
            </span>
          )}
        </>
      )}
    </div>
  );
}

// Hook for TTS from outside
export function useTextToSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if ('speechSynthesis' in window) synthRef.current = window.speechSynthesis;
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    setSpeaking(true);

    const cleaned = text
      .replace(/```[\s\S]*?```/g, 'code block')
      .replace(/`[^`]+`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .trim()
      .slice(0, 2000);

    const utterance = new SpeechSynthesisUtterance(cleaned);
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Samantha') || v.name.includes('Karen') || (v.lang === 'en-US' && v.localService)
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.05;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synthRef.current.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.cancel();
    setSpeaking(false);
  }, []);

  return { speak, stop, speaking };
}

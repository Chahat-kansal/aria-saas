'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface Props {
  code: string;
  language: string;
  onClose?: () => void;
}

interface ExecutionResult {
  stdout: string;
  stderr: string;
  code: number;
  compile_output?: string;
  error?: string;
}

interface Attempt {
  attempt: number;
  code: string;
  result: ExecutionResult;
  fixed: boolean;
  explanation?: string;
}

interface RunResponse {
  success: boolean;
  attempts: Attempt[];
  finalCode: string;
  autoFixed: boolean;
  totalAttempts: number;
}

const LANG_ICONS: Record<string, string> = {
  python: '🐍', javascript: '🟨', typescript: '🔷', js: '🟨', ts: '🔷',
  bash: '💻', sh: '💻', c: '⚙️', cpp: '⚙️', 'c++': '⚙️', go: '🐹',
  rust: '🦀', ruby: '💎', java: '☕', r: '📊', php: '🐘', swift: '🍎', kotlin: '🟣',
};

const SUPPORTED_LANGUAGES = [
  'python','javascript','typescript','bash','c','cpp','go','rust','ruby','java','r','php','swift','kotlin'
];

export function CodeExecutor({ code: initialCode, language: initialLang, onClose }: Props) {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState(initialLang || 'python');
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [autoFix, setAutoFix] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [tab, setTab] = useState<'code' | 'output'>('code');
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);

  const icon = LANG_ICONS[language] || '💻';

  async function runCode() {
    if (!code.trim()) {
      toast.error('No code to run');
      return;
    }

    setRunning(true);
    setTab('output');
    setRunResult(null);
    setExpandedAttempt(null);

    try {
      const res = await fetch('/api/execute-autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, stdin, autoFix }),
      });

      let data: RunResponse | any = null;

      try {
        data = await res.json();
      } catch {
        setTab('code');
        toast.error('Invalid server response');
        return;
      }

      if (!res.ok) {
        setTab('code');
        toast.error(data?.error || 'Execution failed');
        return;
      }

      setRunResult(data);
      setExpandedAttempt(data.totalAttempts - 1);

      if (data.success && data.autoFixed) {
        toast.success(`✨ Auto-fixed in ${data.totalAttempts} attempt${data.totalAttempts > 1 ? 's' : ''}!`);
        setCode(data.finalCode);
      } else if (!data.success) {
        toast.error(`Failed after ${data.totalAttempts} attempt${data.totalAttempts > 1 ? 's' : ''}`);
      }

    } catch (err: any) {
      setRunResult(null);
      setTab('code');
      toast.error(err.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied!');
    } catch {
      toast.error('Copy failed');
    }
  }

  function applyFixedCode(fixedCode: string) {
    setCode(fixedCode);
    setTab('code');
    toast.success('Fixed code applied to editor');
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <span className="text-sm">{icon}</span>

        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="bg-white/5 border border-white/10 text-xs rounded-lg px-2 py-1.5 text-white outline-none"
        >
          {SUPPORTED_LANGUAGES.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Auto-fix toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#888899]">Auto-fix</span>
          <button
            onClick={() => setAutoFix(a => !a)}
            className={`relative w-8 h-4 rounded-full transition-colors ${autoFix ? 'bg-[#6C63FF]' : 'bg-white/10'}`}
          >
            <div
              className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all"
              style={{ left: autoFix ? '18px' : '2px' }}
            />
          </button>
        </div>

        <button
          onClick={() => setShowStdin(s => !s)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${
            showStdin
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'
          }`}
        >
          stdin
        </button>

        <button
          onClick={runCode}
          disabled={running}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
        >
          {running ? 'Running…' : '▶ Run'}
        </button>

        {onClose && (
          <button onClick={onClose} className="text-[#888899] hover:text-white text-xs px-2">
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'code' ? (
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            className="w-full h-full bg-transparent text-white font-mono text-xs p-4 outline-none"
          />
        ) : (
          <div className="p-4 text-xs text-white">
            {runResult ? 'Execution complete' : 'No output'}
          </div>
        )}
      </div>
    </div>
  );
}

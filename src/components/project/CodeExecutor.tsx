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
    if (!code.trim()) { toast.error('No code to run'); return; }
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
      const data: RunResponse = await res.json();
      if (!res.ok) { toast.error((data as any).error || 'Execution failed'); return; }
      setRunResult(data);

      // Auto-expand the last attempt
      setExpandedAttempt(data.totalAttempts - 1);

      if (data.success && data.autoFixed) {
        toast.success(`✨ Auto-fixed in ${data.totalAttempts} attempt${data.totalAttempts > 1 ? 's' : ''}!`);
        // Update code in editor with the fixed version
        setCode(data.finalCode);
      } else if (!data.success) {
        toast.error(`Failed after ${data.totalAttempts} attempt${data.totalAttempts > 1 ? 's' : ''}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(code);
    toast.success('Copied!');
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
        <select value={language} onChange={e => setLanguage(e.target.value)}
          className="bg-white/5 border border-white/10 text-xs rounded-lg px-2 py-1.5 text-white outline-none">
          {SUPPORTED_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="flex-1" />

        {/* Auto-fix toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#888899]">Auto-fix</span>
          <button onClick={() => setAutoFix(a => !a)}
            className={`relative w-8 h-4 rounded-full transition-colors ${autoFix ? 'bg-[#6C63FF]' : 'bg-white/10'}`}>
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${autoFix ? 'left-4.5' : 'left-0.5'}`}
              style={{ left: autoFix ? '18px' : '2px' }} />
          </button>
        </div>

        <button onClick={() => setShowStdin(s => !s)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${showStdin ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
          stdin
        </button>
        <button onClick={runCode} disabled={running}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-all">
          {running
            ? <><span className="animate-spin text-sm">⟳</span> {autoFix ? 'Running & fixing…' : 'Running…'}</>
            : '▶ Run'}
        </button>
        {onClose && <button onClick={onClose} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">✕</button>}
      </div>

      {/* Stdin */}
      {showStdin && (
        <div className="px-3 py-2 border-b border-white/5 bg-[#16161d] flex-shrink-0">
          <label className="text-[10px] text-[#888899] uppercase tracking-wider block mb-1">stdin</label>
          <textarea value={stdin} onChange={e => setStdin(e.target.value)}
            placeholder="Input your program reads from stdin…"
            rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono resize-none outline-none focus:border-amber-500/50 placeholder:text-[#555566]" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/5 bg-[#16161d] flex-shrink-0">
        {(['code', 'output'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-all capitalize ${tab === t ? 'border-[#6C63FF] text-white' : 'border-transparent text-[#888899] hover:text-white'}`}>
            {t === 'output' ? (
              <span className="flex items-center gap-1.5">
                Output
                {runResult && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${runResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {runResult.success ? '✓' : '✗'}
                  </span>
                )}
              </span>
            ) : t}
          </button>
        ))}
        {runResult && (
          <div className="ml-auto flex items-center gap-2 px-3">
            {runResult.autoFixed && (
              <span className="text-[10px] bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-2 py-0.5 rounded-full">
                ✨ Auto-fixed
              </span>
            )}
            <span className="text-[10px] text-[#555566]">
              {runResult.totalAttempts} attempt{runResult.totalAttempts > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'code' ? (
          <div className="h-full relative">
            <div className="absolute top-2 right-2 flex gap-1.5 z-10">
              <button onClick={copyCode} className="bg-white/5 hover:bg-white/10 border border-white/10 text-[#888899] hover:text-white text-[10px] px-2 py-1 rounded transition-all">
                Copy
              </button>
            </div>
            <textarea value={code} onChange={e => setCode(e.target.value)}
              className="w-full h-full bg-transparent text-white font-mono text-xs p-4 resize-none outline-none leading-6 pr-20"
              spellCheck={false} placeholder="Paste or type your code here…" />
          </div>
        ) : (
          <div className="p-4 space-y-3 font-mono text-xs">
            {running && (
              <div className="flex items-center gap-3 text-[#888899] py-4 justify-center">
                <span className="animate-spin text-lg">⟳</span>
                <div>
                  <div className="text-sm">{autoFix ? 'Running code…' : `Executing ${language}…`}</div>
                  {autoFix && <div className="text-[10px] text-[#555566] mt-0.5">Will auto-fix errors with Claude if needed</div>}
                </div>
              </div>
            )}

            {!running && !runResult && (
              <div className="text-[#555566] text-center py-8 text-sm">
                Press ▶ Run to execute your code
                {autoFix && <div className="text-[10px] mt-1 text-[#444455]">Auto-fix is on — errors will be fixed automatically</div>}
              </div>
            )}

            {runResult && (
              <>
                {/* Summary banner */}
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${runResult.success
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-red-500/10 border-red-500/20'}`}>
                  <span className="text-lg">{runResult.success ? '✅' : '❌'}</span>
                  <div className="flex-1">
                    <div className={`text-xs font-semibold ${runResult.success ? 'text-green-400' : 'text-red-400'}`}>
                      {runResult.success
                        ? runResult.autoFixed
                          ? `Fixed and ran successfully in ${runResult.totalAttempts} attempt${runResult.totalAttempts > 1 ? 's' : ''}`
                          : 'Ran successfully'
                        : `Failed after ${runResult.totalAttempts} attempt${runResult.totalAttempts > 1 ? 's' : ''}`}
                    </div>
                    {runResult.autoFixed && (
                      <div className="text-[10px] text-green-500/70 mt-0.5">
                        ✨ Claude automatically detected and fixed the error
                      </div>
                    )}
                  </div>
                  {runResult.autoFixed && (
                    <button onClick={() => applyFixedCode(runResult.finalCode)}
                      className="text-[10px] bg-[#6C63FF] text-white px-2 py-1 rounded-lg font-medium hover:bg-[#4b44cc] transition-colors whitespace-nowrap">
                      Use fixed code
                    </button>
                  )}
                </div>

                {/* Attempt history */}
                {runResult.attempts.map((attempt, idx) => (
                  <div key={idx} className={`border rounded-xl overflow-hidden ${
                    attempt.result.code === 0 && !attempt.result.error && !attempt.result.stderr
                      ? 'border-green-500/20 bg-green-500/5'
                      : 'border-red-500/20 bg-red-500/5'
                  }`}>
                    {/* Attempt header */}
                    <button
                      onClick={() => setExpandedAttempt(expandedAttempt === idx ? null : idx)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        attempt.result.code === 0 && !attempt.result.error && !attempt.result.stderr
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        Attempt {attempt.attempt}
                      </span>
                      {attempt.fixed && (
                        <span className="text-[9px] bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-1.5 py-0.5 rounded-full">
                          🤖 Claude fix
                        </span>
                      )}
                      {attempt.explanation && (
                        <span className="text-[10px] text-[#888899] truncate flex-1">{attempt.explanation}</span>
                      )}
                      <span className="text-[#555566] text-[10px] ml-auto">
                        {expandedAttempt === idx ? '▲' : '▼'}
                      </span>
                    </button>

                    {/* Attempt detail */}
                    {expandedAttempt === idx && (
                      <div className="border-t border-white/5 p-3 space-y-2">
                        {/* Code used */}
                        {attempt.fixed && (
                          <div>
                            <div className="text-[10px] text-[#555566] uppercase tracking-wider mb-1">Code used in this attempt</div>
                            <pre className="bg-[#0a0a14] rounded-lg p-3 text-[11px] text-[#c8c8e8] overflow-x-auto max-h-40 leading-relaxed">
                              {attempt.code}
                            </pre>
                          </div>
                        )}

                        {/* Compile output */}
                        {attempt.result.compile_output?.trim() && (
                          <div>
                            <div className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">Compile output</div>
                            <pre className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-300 whitespace-pre-wrap max-h-32 overflow-auto">
                              {attempt.result.compile_output}
                            </pre>
                          </div>
                        )}

                        {/* Stdout */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] text-[#555566] uppercase tracking-wider">stdout</div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                              attempt.result.code === 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                            }`}>
                              exit {attempt.result.code}
                            </span>
                          </div>
                          <pre className="bg-[#0a0a14] rounded-lg p-3 text-[11px] max-h-48 overflow-auto leading-relaxed">
                            {attempt.result.stdout ? (
                              <span className="text-green-300">{attempt.result.stdout}</span>
                            ) : (
                              <span className="text-[#555566] italic">no output</span>
                            )}
                          </pre>
                        </div>

                        {/* Stderr */}
                        {attempt.result.stderr?.trim() && (
                          <div>
                            <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">stderr</div>
                            <pre className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-[11px] text-red-300 whitespace-pre-wrap max-h-40 overflow-auto">
                              {attempt.result.stderr}
                            </pre>
                          </div>
                        )}

                        {/* Error */}
                        {attempt.result.error && (
                          <div>
                            <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">error</div>
                            <pre className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-[11px] text-red-300 whitespace-pre-wrap">
                              {attempt.result.error}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Give up message */}
                {!runResult.success && runResult.totalAttempts >= 3 && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <div className="text-sm text-[#888899] mb-2">Could not auto-fix after 3 attempts</div>
                    <div className="text-[10px] text-[#555566]">
                      Copy the error and ask Aria in the chat to help debug it
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

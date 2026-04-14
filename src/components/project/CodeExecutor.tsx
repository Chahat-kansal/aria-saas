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
}

interface RunResponse {
  success: boolean;
  attempts: Attempt[];
  finalCode: string;
  autoFixed: boolean;
  totalAttempts: number;
  error?: string;
}

export function CodeExecutor({ code: initialCode, language: initialLang, onClose }: Props) {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState(initialLang || 'python');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [tab, setTab] = useState<'code' | 'output'>('code');

  async function runCode() {
    if (!code.trim()) {
      toast.error('No code to run');
      return;
    }

    setRunning(true);
    setTab('output');
    setRunResult(null);

    try {
      const res = await fetch('/api/execute-autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      let data: RunResponse;

      try {
        data = await res.json();
      } catch {
        toast.error('Invalid server response');
        setRunning(false);
        setTab('code');
        return;
      }

      if (!res.ok) {
        toast.error(data?.error || 'Execution failed');
        setRunning(false);
        setTab('code');
        return;
      }

      setRunResult(data);

    } catch (err: any) {
      toast.error(err.message || 'Execution failed');
      setTab('code');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e12]">
      
      {/* HEADER */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d]">
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="bg-white/5 border border-white/10 text-xs rounded-lg px-2 py-1.5 text-white"
        >
          <option value="python">python</option>
          <option value="javascript">javascript</option>
        </select>

        <div className="flex-1" />

        <button
          onClick={runCode}
          disabled={running}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
        >
          {running ? 'Running…' : '▶ Run'}
        </button>

        {onClose && (
          <button onClick={onClose} className="text-white text-xs">✕</button>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-auto">
        
        {/* CODE TAB */}
        {tab === 'code' && (
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            className="w-full h-full bg-transparent text-white font-mono text-xs p-4 outline-none"
          />
        )}

        {/* OUTPUT TAB */}
        {tab === 'output' && (
          <div className="p-4 text-xs text-white font-mono space-y-3">

            {running && <div>Running...</div>}

            {!running && !runResult && (
              <div className="text-gray-400">No output</div>
            )}

            {runResult && runResult.attempts.map((a, i) => (
              <div key={i} className="border border-white/10 p-3 rounded-lg">
                
                <div className="text-gray-400 mb-1">
                  Attempt {a.attempt}
                </div>

                {/* STDOUT */}
                <div className="text-green-400 whitespace-pre-wrap">
                  {a.result.stdout || 'no stdout'}
                </div>

                {/* STDERR */}
                {a.result.stderr && (
                  <div className="text-red-400 whitespace-pre-wrap mt-2">
                    {a.result.stderr}
                  </div>
                )}

                {/* ERROR */}
                {a.result.error && (
                  <div className="text-red-500 whitespace-pre-wrap mt-2">
                    {a.result.error}
                  </div>
                )}

              </div>
            ))}

          </div>
        )}
      </div>
    </div>
  );
}

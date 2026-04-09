import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Settings, Trash2, Copy, Code, Activity, Play, FileAudio, List, X, Download } from 'lucide-react';
import { useMorseAudio } from './hooks/useMorseAudio';
import { MORSE_DICT } from './utils/morse';

const App: React.FC = () => {
  const [threshold, setThreshold] = useState(15);
  const [wpm, setWpm] = useState(15);
  const [transcript, setTranscript] = useState("");
  const [currentMorse, setCurrentMorse] = useState("");
  const [status, setStatus] = useState<'idle' | 'listening' | 'detecting'>('idle');
  const [showDictionary, setShowDictionary] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const unitMs = 1200 / wpm;

  const handleSignalStarted = useCallback(() => setStatus('detecting'), []);
  const handleSignalEnded = useCallback((duration: number) => {
    setStatus('listening');
    if (duration < unitMs * 1.75) setCurrentMorse(prev => prev + ".");
    else setCurrentMorse(prev => prev + "-");
  }, [unitMs]);

  const handleSilenceEnded = useCallback((duration: number) => {
    if (currentMorse) {
      if (duration > unitMs * 2.5) {
        const char = MORSE_DICT[currentMorse] || "";
        setTranscript(prev => prev + char);
        setCurrentMorse("");
        if (duration > unitMs * 6) setTranscript(prev => prev + " ");
      }
    }
  }, [currentMorse, unitMs]);

  const handleFrame = useCallback((data: Uint8Array) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00f2ff';
    ctx.beginPath();
    const sliceWidth = canvas.width / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }, []);

  const { start, stop, isRecording, currentLevel, lastStateChangeTime } = useMorseAudio({
    threshold, wpm, onSignalStarted: handleSignalStarted, onSignalEnded: handleSignalEnded,
    onSilenceEnded: handleSilenceEnded, onFrame: handleFrame
  });

  useEffect(() => {
    if (!isRecording || !currentMorse) return;
    const interval = setInterval(() => {
        const now = performance.now();
        const silenceDuration = now - lastStateChangeTime;
        if (silenceDuration > unitMs * 3 && currentMorse) {
           setTranscript(prev => prev + (MORSE_DICT[currentMorse] || ""));
           setCurrentMorse("");
        }
    }, 100);
    return () => clearInterval(interval);
  }, [isRecording, currentMorse, lastStateChangeTime, unitMs]);

  const playText = useCallback(async (text: string) => {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const morse = text.toUpperCase().split("").map(char => {
      if (char === " ") return "/";
      return Object.entries(MORSE_DICT).find(([_, v]) => v === char)?.[0] || "";
    }).join(" ");
    let time = ctx.currentTime + 0.1;
    const freq = 600;
    for (const char of morse) {
      if (char === "." || char === "-") {
        const dur = char === "." ? unitMs : unitMs * 3;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.setValueAtTime(0, time + (dur / 1000));
        osc.start(time);
        osc.stop(time + (dur / 1000));
        time += (dur + unitMs) / 1000;
      } else if (char === " ") time += (unitMs * 2) / 1000;
      else if (char === "/") time += (unitMs * 4) / 1000;
    }
  }, [unitMs]);

  const downloadMorseAudio = useCallback(async (text: string) => {
    if (!text) {
      alert("Please type some text first!");
      return;
    }
    
    try {
      const morse = text.toUpperCase().split("").map(char => {
        if (char === " ") return "/";
        return Object.entries(MORSE_DICT).find(([_, v]) => v === char)?.[0] || "";
      }).join(" ");

      // Calculate total duration
      let totalDuration = 0.5; // padding
      for (const char of morse) {
        if (char === ".") totalDuration += (unitMs * 2) / 1000;
        else if (char === "-") totalDuration += (unitMs * 4) / 1000;
        else if (char === " ") totalDuration += (unitMs * 2) / 1000;
        else if (char === "/") totalDuration += (unitMs * 4) / 1000;
      }

      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(1, Math.max(sampleRate * 0.1, sampleRate * totalDuration), sampleRate);
      let time = 0.1;
      const freq = 600;

      for (const char of morse) {
          if (char === "." || char === "-") {
              const dur = char === "." ? unitMs : unitMs * 3;
              const osc = offlineCtx.createOscillator();
              const gain = offlineCtx.createGain();
              osc.frequency.value = freq;
              osc.connect(gain);
              gain.connect(offlineCtx.destination);
              gain.gain.setValueAtTime(0.3, time);
              gain.gain.setValueAtTime(0, time + (dur / 1000));
              osc.start(time);
              osc.stop(time + (dur / 1000));
              time += (dur + unitMs) / 1000;
          } else if (char === " ") time += (unitMs * 2) / 1000;
          else if (char === "/") time += (unitMs * 4) / 1000;
      }

      const renderedBuffer = await offlineCtx.startRendering();
      
      // Encode to MP3 using lamejs
      // @ts-ignore
      const lame = await import('lamejs');
      // Some versions of lamejs export as default, some as properties
      const Mp3Encoder = lame.Mp3Encoder || lame.default?.Mp3Encoder;
      
      if (!Mp3Encoder) {
          throw new Error("MP3 Encoder not found in lamejs library");
      }

      const mp3encoder = new Mp3Encoder(1, sampleRate, 128);
      const samples = renderedBuffer.getChannelData(0);
      const sampleCount = samples.length;
      
      const pcmData = new Int16Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      const mp3Data = [];
      const sampleBlockSize = 576; 
      for (let i = 0; i < pcmData.length; i += sampleBlockSize) {
        const sampleChunk = pcmData.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
      }
      
      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) mp3Data.push(mp3buf);

      const blob = new Blob(mp3Data, { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `morse-${text.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 15)}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("MP3 Download Error:", err);
      alert("Failed to generate MP3. Please try again.");
    }
  }, [unitMs]);

  const handleToggleRecording = () => {
    if (isRecording) {
      if (currentMorse) {
        setTranscript(prev => prev + (MORSE_DICT[currentMorse] || ""));
        setCurrentMorse("");
      }
      stop();
      setStatus('idle');
    } else {
      start();
      setStatus('listening');
    }
  };

  const handleFile = async (file: File) => {
    if (!file || !file.type.startsWith('audio/')) { alert("Please upload a valid audio file."); return; }
    setIsProcessingFile(true); setTranscript(""); setProgress(0);
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const stepSize = Math.floor(sampleRate * 0.005); // 5ms steps for precision
      
      // Auto-normalize: find peak in the whole file
      let peak = 0;
      for (let i = 0; i < channelData.length; i++) {
        const val = Math.abs(channelData[i]);
        if (val > peak) peak = val;
      }
      const scaleFactor = peak > 0 ? (0.9 / peak) : 1;
      
      let localMorse = "";
      let localTranscript = "";
      let lastState: 'SOUND' | 'SILENCE' = 'SILENCE';
      let stateStartTime = 0;
      
      // Detection params
      const filterWindow = 3; // Rolling average window
      let history: number[] = new Array(filterWindow).fill(0);

      const activeThreshold = Math.min(threshold, 15);
      const hysteresis = 5; // Extra gap to end a signal
      
      for (let i = 0; i < channelData.length; i += stepSize) {
        const currentTime = i / sampleRate;
        let maxVal = 0;
        for (let j = 0; j < stepSize && i + j < channelData.length; j++) {
            maxVal = Math.max(maxVal, Math.abs(channelData[i + j]) * scaleFactor);
        }

        // Smooth the signal
        history.shift();
        history.push(maxVal * 100);
        const smoothedVolume = history.reduce((a, b) => a + b) / history.length;

        let currentState = lastState;
        if (lastState === 'SILENCE' && smoothedVolume > activeThreshold) {
            currentState = 'SOUND';
        } else if (lastState === 'SOUND' && smoothedVolume < (activeThreshold - hysteresis)) {
            currentState = 'SILENCE';
        }

        if (currentState !== lastState) {
          const duration = (currentTime - stateStartTime) * 1000;
          if (lastState === 'SOUND') {
            // Noise gate: ignore signals shorter than 1/4 of a dot
            if (duration > unitMs * 0.25) {
                if (duration < unitMs * 1.8) localMorse += ".";
                else localMorse += "-";
            }
          } else {
            if (duration > unitMs * 6) {
              if (localMorse) {
                  localTranscript += (MORSE_DICT[localMorse] || "");
                  localMorse = "";
              }
              if (localTranscript && !localTranscript.endsWith(" ")) localTranscript += " ";
            } else if (duration > unitMs * 2.2) {
              if (localMorse) {
                  localTranscript += (MORSE_DICT[localMorse] || "");
                  localMorse = "";
              }
            }
          }
          lastState = currentState;
          stateStartTime = currentTime;
        }

        if (i % (stepSize * 100) === 0) {
           setProgress(Math.floor((i / channelData.length) * 100));
        }
      }
      
      // Final flush
      if (localMorse) localTranscript += (MORSE_DICT[localMorse] || "");
      
      setTranscript(localTranscript);
      if (!localTranscript) alert("No signal detected. Check if the file contains clear morse beeps and adjust WPM.");
    } catch (err) {
 alert("Error processing audio file."); } finally { setIsProcessingFile(false); setProgress(100); }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript]);

  return (
    <div 
      className={`min-h-screen flex flex-col items-center p-4 md:p-8 max-w-6xl mx-auto transition-all duration-300 ${isDragging ? 'bg-accent-primary/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-overlay p-4">
          <div className="flex flex-col items-center gap-6 text-accent-primary border-4 border-dashed border-accent-primary p-10 md:p-20 rounded-[2rem] md:rounded-[3rem] bg-background-primary/95 backdrop-blur-2xl shadow-[0_0_100px_rgba(0,242,255,0.2)] animate-in zoom-in duration-300 w-full max-w-lg">
            <div className="p-6 md:p-8 bg-accent-primary/10 rounded-full animate-bounce">
              <FileAudio size={48} className="md:w-20 md:h-20" />
            </div>
            <h2 className="text-2xl md:text-4xl font-black tracking-[0.2em] md:tracking-[0.3em] drop-shadow-[0_0_15px_rgba(0,242,255,0.6)]">DROP AUDIO</h2>
            <p className="text-text-secondary font-mono text-xs md:text-sm">Release to begin translation</p>
          </div>
        </div>
      )}

      <header className="mb-8 w-full">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">
          MORSE LIVE <span className="text-[10px] md:text-sm font-normal text-text-secondary align-middle ml-2">V2.0-TW</span>
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full flex-1">
        <main className="lg:col-span-8 flex flex-col gap-8">
          <div className="card h-[250px] md:h-[350px] flex flex-col p-4 md:p-8">
            <div className="card-header-gradient" />
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                <div className={`w-3 h-3 rounded-full ${isRecording ? (status === 'detecting' ? 'bg-success shadow-[0_0_10px_#00ff88] animate-pulse-custom' : 'bg-error shadow-[0_0_10px_#ff4d4d] animate-pulse') : 'bg-text-secondary'}`} />
                <span>{isRecording ? (status === 'detecting' ? 'SIGNAL DETECTED' : 'LISTENING...') : 'IDLE'}</span>
              </div>
              <div className="text-text-secondary text-[10px] font-mono">
                AMPLITUDE: {currentLevel.toFixed(1)}%
              </div>
            </div>
            <canvas ref={canvasRef} className="flex-1 w-full" width="800" height="200" />
            <div className="font-mono text-accent-primary mt-4 h-6 text-2xl tracking-widest">
               {currentMorse || <span className="opacity-20">...</span>}
            </div>
          </div>

          <div className="card flex-1 flex flex-col min-h-[300px] md:min-h-[400px] p-4 md:p-8">
            <div className="card-header-gradient" />
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2 font-bold text-accent-primary">
                <Activity size={18} />
                <span>TRANSLATION</span>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary h-10 w-10 !p-0" onClick={() => {navigator.clipboard.writeText(transcript); alert("Copied!");}} title="Copy">
                  <Copy size={16} />
                </button>
                <button className="btn-secondary h-10 w-10 !p-0 hover:bg-error/10 hover:border-error/50" onClick={() => setTranscript("")} title="Clear">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div ref={transcriptRef} className="transcript-area">
              {transcript || <span className="text-border italic">Waiting for signal...</span>}
            </div>
          </div>
        </main>

        <aside className="lg:col-span-4 flex flex-col gap-6">
          <div className="card flex flex-col gap-6">
            <div className="card-header-gradient" />
            <div className="flex items-center gap-2 font-bold text-accent-secondary">
              <Settings size={18} />
              <span>CONFIGURATION</span>
            </div>

            <button 
              className={`btn w-full ${isRecording ? 'btn-stop' : 'btn-primary'}`}
              onClick={handleToggleRecording}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
              {isRecording ? 'STOP LISTENING' : 'START LISTENING'}
            </button>

            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="input-label">THRESHOLD</label>
                <span className="text-accent-primary font-mono font-bold leading-none">{threshold}</span>
              </div>
              <input type="range" min="1" max="50" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-accent-primary" />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="input-label">WPM (SPEED)</label>
                <span className="text-accent-primary font-mono font-bold leading-none">{wpm}</span>
              </div>
              <input type="range" min="5" max="40" value={wpm} onChange={(e) => setWpm(Number(e.target.value))} className="w-full accent-accent-primary" />
            </div>

            <div className="pt-6 border-t border-border">
              <div className="flex items-center gap-2 font-bold mb-4 text-success">
                <Play size={18} />
                <span>TEXT TO MORSE</span>
              </div>
              <div className="flex gap-2 mb-2">
                <input 
                  id="playbackInput"
                  type="text" 
                  placeholder="Type and press Enter..." 
                  className="btn btn-secondary flex-1 cursor-text !text-left text-xs transition-all focus:border-success/50 focus:ring-1 focus:ring-success/20 overflow-hidden"
                  onKeyPress={(e) => e.key === 'Enter' && playText((e.target as HTMLInputElement).value)}
                />
                <button 
                  className="btn btn-secondary h-full p-3" 
                  onClick={() => downloadMorseAudio((document.getElementById('playbackInput') as HTMLInputElement).value)}
                  title="Download Audio"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-border/50">
              <div className="flex items-center gap-2 font-black mb-4 text-accent-primary text-xs tracking-widest">
                <FileAudio size={18} />
                <span>FILE TRANSLATION</span>
              </div>
              
              <div 
                className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-6 transition-all duration-300 flex flex-col items-center gap-3 text-center ${isProcessingFile ? 'border-accent-primary bg-accent-primary/5' : 'border-border hover:border-accent-primary/50 hover:bg-white/5'}`}
                onClick={() => document.getElementById('fileInput')?.click()}
              >
                <input 
                  id="fileInput"
                  type="file" 
                  accept=".mp3,.wav,audio/*" 
                  onChange={(e) => {const file = e.target.files?.[0]; if (file) handleFile(file);}} 
                  className="hidden" 
                />
                
                {isProcessingFile ? (
                   <>
                     <div className="w-10 h-10 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
                     <span className="text-xs font-bold text-accent-primary">PROCESSING {progress}%</span>
                   </>
                ) : (
                  <>
                    <div className="p-3 bg-white/5 rounded-xl group-hover:bg-accent-primary/10 transition-colors">
                      <FileAudio size={24} className="text-text-secondary group-hover:text-accent-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-text-primary mb-1">DRAG & DROP</p>
                      <p className="text-[10px] text-text-secondary">or click to browse audio</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button className="btn btn-secondary w-full text-xs" onClick={() => setShowDictionary(true)}>
              <List size={18} />
              MORSE DICTIONARY
            </button>
          </div>
        </aside>
      </div>
      
      <footer className="mt-12 text-text-secondary text-xs flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
        <Code size={14} />
        <span>V2.0-TW &bull; Built with Tailwind CSS</span>
      </footer>

      {/* Dictionary Sidebar */}
      <div className={`dictionary-sidebar ${showDictionary ? 'open' : ''}`}>
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-bold text-accent-primary tracking-tight">DICTIONARY</h3>
          <button onClick={() => setShowDictionary(false)} className="text-text-secondary hover:text-error transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 overflow-y-auto">
          {Object.entries(MORSE_DICT).map(([code, char]) => (
            <div key={code} className="flex justify-between items-center bg-background-secondary p-3 rounded-xl border border-border">
              <span className="font-extrabold text-text-primary">{char}</span>
              <span className="font-mono text-xs text-accent-secondary">{code}</span>
            </div>
          ))}
        </div>
      </div>
      
      {showDictionary && <div className="overlay" onClick={() => setShowDictionary(false)}></div>}
    </div>
  );
};

export default App;

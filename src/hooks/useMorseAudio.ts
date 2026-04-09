import { useEffect, useRef, useState, useCallback } from 'react';

interface UseMorseAudioProps {
  threshold: number;
  wpm: number;
  onSignalStarted: () => void;
  onSignalEnded: (duration: number) => void;
  onSilenceEnded: (duration: number) => void;
  onFrame: (data: Uint8Array) => void;
}

export const useMorseAudio = ({
  threshold,
  wpm,
  onSignalStarted,
  onSignalEnded,
  onSilenceEnded,
  onFrame
}: UseMorseAudioProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastStateRef = useRef<'SILENCE' | 'SOUND'>('SILENCE');
  const stateChangeTimeRef = useRef<number>(performance.now());

  // Unit duration in ms based on WPM
  // Standard formula: unit = 1200 / wpm
  const unitDuration = 1200 / wpm;

  const processAudio = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Notify visualizer with time domain data for the waveform
    const timeData = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(timeData);
    onFrame(timeData);

    // Filter focus: Morse beeps are usually 400Hz - 1000Hz
    // Calculate energy in that specific range
    const nyquist = audioContextRef.current!.sampleRate / 2;
    const binSize = nyquist / dataArray.length;
    
    let signalEnergy = 0;
    let count = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const freq = i * binSize;
        if (freq >= 400 && freq <= 1000) {
            signalEnergy += dataArray[i];
            count++;
        }
    }
    const averageEnergy = count > 0 ? (signalEnergy / count) : 0;
    const volume = (averageEnergy / 255) * 100; // 0 to 100
    
    setCurrentLevel(volume);

    const now = performance.now();
    const currentState = volume > threshold ? 'SOUND' : 'SILENCE';

    if (currentState !== lastStateRef.current) {
      const duration = now - stateChangeTimeRef.current;
      
      if (currentState === 'SOUND') {
        // Just transitioned from SILENCE to SOUND
        onSilenceEnded(duration);
        onSignalStarted();
      } else {
        // Just transitioned from SOUND to SILENCE
        onSignalEnded(duration);
      }
      
      lastStateRef.current = currentState;
      stateChangeTimeRef.current = now;
    } else {
        // State remains the same, but if we are in SILENCE for a very long time
        // we might want to trigger a word break if we haven't yet.
        // This is handled by the caller checking duration.
    }

    animationFrameRef.current = requestAnimationFrame(processAudio);
  }, [threshold, onSignalStarted, onSignalEnded, onSilenceEnded, onFrame]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsRecording(true);
      lastStateRef.current = 'SILENCE';
      stateChangeTimeRef.current = performance.now();
      processAudio();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or not available.");
    }
  };

  const stop = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setCurrentLevel(0);
  };

  useEffect(() => {
    return () => stop();
  }, []);

  return { start, stop, isRecording, currentLevel, unitDuration, lastStateChangeTime: stateChangeTimeRef.current };
};

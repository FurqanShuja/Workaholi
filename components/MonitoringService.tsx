import React, { useEffect, useRef, useState, useCallback } from 'react';
import { UserSettings } from '../types';
import { ACTIVITY_DECAY_RATE, KEY_ACTIVITY_BOOST, MOUSE_ACTIVITY_BOOST } from '../constants';
import { CameraOff, Loader2 } from 'lucide-react';

// Declare global faceapi from the CDN script
declare const faceapi: any;

interface MonitoringServiceProps {
  settings: UserSettings['monitoring'];
  onActivityUpdate: (score: number) => void;
  isActive: boolean;
}

export const MonitoringService: React.FC<MonitoringServiceProps> = ({ settings, onActivityUpdate, isActive }) => {
  const [currentScore, setCurrentScore] = useState<number>(50);
  const [cameraActive, setCameraActive] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Logic to calculate score ---
  const updateScore = useCallback((delta: number) => {
    setCurrentScore(prev => {
      const next = prev + delta;
      return Math.min(100, Math.max(0, next));
    });
  }, []);

  // --- Load Models ---
  useEffect(() => {
    if (!settings.camera) return;

    const loadModels = async () => {
      try {
        console.log("Loading Face API models...");
        // Using the GitHub pages hosting for models as a reliable public source
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        console.log("Models loaded");
        setModelsLoaded(true);
      } catch (err) {
        console.error("Failed to load face-api models", err);
        setPermissionError("AI Model Load Failed");
      }
    };

    if (!modelsLoaded) {
      loadModels();
    }
  }, [settings.camera, modelsLoaded]);

  // --- Mouse Monitoring ---
  useEffect(() => {
    if (!isActive || !settings.mouse) return;

    const handleMouseMove = () => updateScore(MOUSE_ACTIVITY_BOOST * 0.1); 
    const handleClick = () => updateScore(MOUSE_ACTIVITY_BOOST);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
    };
  }, [isActive, settings.mouse, updateScore]);

  // --- Keyboard Monitoring ---
  useEffect(() => {
    if (!isActive || !settings.keyboard) return;
    const handleKeyDown = () => updateScore(KEY_ACTIVITY_BOOST);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, settings.keyboard, updateScore]);


  // --- Camera Monitoring (Real AI) ---
  useEffect(() => {
    // Cleanup helper
    const stopCamera = () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
      setFaceDetected(false);
    };

    if (!settings.camera || !isActive || !modelsLoaded) {
      stopCamera();
      return;
    }

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        streamRef.current = stream;
        setCameraActive(true);
        setPermissionError(null);
        
        // Start Detection Loop
        startDetectionLoop();
      } catch (err) {
        console.error("Camera access denied", err);
        setPermissionError("Camera Access Denied");
        setCameraActive(false);
      }
    };

    const startDetectionLoop = () => {
        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);

        detectionIntervalRef.current = setInterval(async () => {
            if (videoRef.current && cameraActive && !videoRef.current.paused && !videoRef.current.ended) {
                try {
                    // Use TinyFaceDetector for performance
                    const detections = await faceapi.detectAllFaces(
                        videoRef.current,
                        new faceapi.TinyFaceDetectorOptions()
                    );

                    const isFace = detections.length > 0;
                    setFaceDetected(isFace);

                    if (isFace) {
                        // High reward for maintaining eye contact/presence
                        // +6 combined with -4 decay = +2 net gain per tick (approx)
                        // This allows recovering focus if you look at screen
                        updateScore(6);
                    } else {
                        // Penalty for leaving (in addition to natural decay)
                        updateScore(-2);
                    }

                } catch (e) {
                    console.warn("Detection error", e);
                }
            }
        }, 500); // Check every 500ms
    };

    startCamera();

    return () => stopCamera();
  }, [settings.camera, isActive, modelsLoaded, updateScore, cameraActive]);

  // --- Decay Loop ---
  useEffect(() => {
    if (!isActive) return;
    const decayInterval = setInterval(() => {
      updateScore(-ACTIVITY_DECAY_RATE);
    }, 2000);
    return () => clearInterval(decayInterval);
  }, [isActive, updateScore]);

  // --- Broadcast ---
  useEffect(() => {
    onActivityUpdate(currentScore);
  }, [currentScore, onActivityUpdate]);


  // --- Render Minimal Camera Preview (HUD style) ---
  if (!settings.camera) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className={`relative w-32 h-24 bg-black border overflow-hidden rounded-md group transition-colors duration-500 ${faceDetected ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-red-900/50'}`}>
        {permissionError ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 text-[10px] text-center p-1 font-mono">
            <CameraOff size={16} className="mb-1" />
            <span>{permissionError}</span>
          </div>
        ) : !modelsLoaded ? (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500/70 text-[10px] text-center p-1 font-mono">
                <Loader2 size={16} className="animate-spin mb-1" />
                <span>INIT AI...</span>
            </div>
        ) : (
          <>
            {/* Video Feed */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`w-full h-full object-cover transition-opacity duration-300 ${faceDetected ? 'opacity-80 mix-blend-normal' : 'opacity-40 grayscale mix-blend-screen'}`}
            />
            
            {/* HUD Overlays */}
            <div className="absolute inset-0 pointer-events-none">
                 {/* Scanning Line (Only if searching) */}
                {!faceDetected && cameraActive && (
                    <div className="w-full h-[1px] bg-red-500/50 absolute top-0 animate-[scan_1.5s_linear_infinite]"></div>
                )}

                {/* Corners */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20"></div>
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20"></div>
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/20"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20"></div>

                {/* Status Text */}
                <div className={`absolute bottom-1 left-1 flex flex-col text-[6px] font-mono leading-tight ${faceDetected ? 'text-cyan-400' : 'text-red-500'}`}>
                   <span className="font-bold">{faceDetected ? 'TARGET: LOCKED' : 'TARGET: LOST'}</span>
                   <span>CONF: {faceDetected ? '99.9%' : '0.0%'}</span>
                </div>

                {/* Face Box Indicator (Simulated dynamic box if locked) */}
                {faceDetected && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border border-cyan-500/40 rounded-sm shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                         <div className="absolute top-0 left-0 w-1 h-1 bg-cyan-400"></div>
                         <div className="absolute bottom-0 right-0 w-1 h-1 bg-cyan-400"></div>
                    </div>
                )}
            </div>
            
            <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
          </>
        )}
      </div>
    </div>
  );
};
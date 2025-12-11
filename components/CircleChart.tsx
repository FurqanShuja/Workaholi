import React, { useState } from 'react';
import { Participant } from '../types';
import { AVATARS } from '../constants';
import { Smile, Clock, PauseCircle, PlayCircle } from 'lucide-react';

interface CircleChartProps {
  participant: Participant;
  isCurrentUser: boolean;
  onPingClick: (targetId: string) => void;
  overrideStatus?: 'active' | 'paused';
  overrideElapsedSeconds?: number;
  pingEmojiOverride?: string;
}

export const CircleChart: React.FC<CircleChartProps> = ({ 
  participant, 
  isCurrentUser, 
  onPingClick,
  overrideStatus,
  overrideElapsedSeconds,
  pingEmojiOverride
}) => {
  // Use overrides if provided (for immediate local feedback), otherwise use participant data
  const status = overrideStatus ?? participant.status;
  const elapsedSeconds = overrideElapsedSeconds ?? participant.elapsedSeconds;

  const { focusScore, name, avatar } = participant;
  const AvatarConfig = AVATARS[avatar];
  const Icon = AvatarConfig.icon;
  
  const [isHoveringCenter, setIsHoveringCenter] = useState(false);

  // Increased size: Radius 100 => Diameter 200px
  const radius = 100;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (focusScore / 100) * circumference;

  // Formatting Time MM:SS
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeString = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  // Determine color based on score
  let strokeColor = "stroke-cyan-500";
  if (focusScore < 30) strokeColor = "stroke-red-500";
  else if (focusScore < 70) strokeColor = "stroke-yellow-500";

  // Dim if paused
  const isPaused = status === 'paused';

  return (
    <div className="flex flex-col items-center">
      
      {/* Top Info Line: Status & Time */}
      <div className={`mb-4 flex items-center space-x-3 px-4 py-2 rounded-full border backdrop-blur-md transition-colors duration-300 ${
        isPaused 
          ? 'bg-red-950/30 border-red-900/50 text-red-400' 
          : 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'
      }`}>
        <div className="flex items-center space-x-1.5">
            {isPaused ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            <span className="text-xs font-mono font-bold tracking-widest uppercase">
                {isPaused ? 'PAUSED' : 'ACTIVE'}
            </span>
        </div>
        <div className="w-px h-3 bg-white/10 mx-2"></div>
        <div className="flex items-center space-x-1.5 text-slate-200">
            <Clock size={14} className="text-slate-500" />
            <span className="font-mono text-sm font-bold tracking-wider tabular-nums">{timeString}</span>
        </div>
      </div>

      <div className="relative group w-[200px] h-[200px]">
        {/* Container */}
        <div className="relative flex flex-col items-center justify-center transition-transform duration-500 hover:scale-105">
          
          {/* SVG Ring */}
          <div className="relative">
            <svg
              height={radius * 2}
              width={radius * 2}
              className={`rotate-[-90deg] transition-all duration-1000 ${isPaused ? 'opacity-30' : 'opacity-100'}`}
            >
              {/* Background Ring */}
              <circle
                stroke="rgba(30, 41, 59, 0.5)"
                strokeWidth={stroke}
                fill="transparent"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
              />
              {/* Active Ring */}
              <circle
                className={`${strokeColor} transition-all duration-1000 ease-in-out drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]`}
                strokeWidth={stroke}
                strokeDasharray={circumference + ' ' + circumference}
                style={{ strokeDashoffset }}
                strokeLinecap="round"
                fill="transparent"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
              />
            </svg>

            {/* Center Content: Avatar OR Ping Action OR Emoji Override */}
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center z-20 rounded-full"
              onMouseEnter={() => !isCurrentUser && setIsHoveringCenter(true)}
              onMouseLeave={() => setIsHoveringCenter(false)}
            >
               {/* 1. Emoji Override Mode (When pinged) */}
               {pingEmojiOverride ? (
                  <div className="animate-zoom text-6xl filter drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                     {pingEmojiOverride}
                  </div>
               ) : (
                  // 2. Hover State for Others: Show PING button overlay
                  !isCurrentUser && isHoveringCenter ? (
                      <button 
                         onClick={() => onPingClick(participant.id)}
                         className="flex flex-col items-center justify-center w-24 h-24 bg-cyan-900/90 rounded-full border border-cyan-400 text-cyan-200 animate-in zoom-in duration-200 shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:bg-cyan-800 transition-colors cursor-pointer"
                      >
                         <Smile size={32} />
                         <span className="text-[10px] font-mono mt-1 font-bold">PING</span>
                      </button>
                  ) : (
                      // 3. Default View: Avatar Icon Only
                      <div className={`transition-all duration-300 ${isPaused ? 'opacity-50 grayscale' : 'opacity-100'}`}>
                         <div className={`${AvatarConfig.color} drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]`}>
                              <Icon size={64} strokeWidth={1} />
                         </div>
                      </div>
                  )
               )}
            </div>
          </div>

          {/* User Info Label (Below Circle) */}
          <div className="mt-6 text-center">
              <h3 className="text-xl font-display font-bold tracking-wider uppercase text-slate-200">
                  {name} {isCurrentUser && <span className="text-xs text-cyan-500 ml-1">(YOU)</span>}
              </h3>
              <div className="flex items-center justify-center space-x-2 mt-2">
                  <span className={`text-3xl font-mono font-bold ${focusScore > 80 ? 'text-cyan-400' : 'text-slate-400'}`}>
                      {Math.round(focusScore)}%
                  </span>
                  <span className="text-[10px] uppercase text-slate-500 tracking-widest">Focus</span>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};
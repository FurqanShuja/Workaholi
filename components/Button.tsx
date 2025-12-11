import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  glow?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  glow = false, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "relative px-6 py-3 font-display uppercase tracking-widest text-sm font-bold transition-all duration-300 clip-path-polygon hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0";
  
  const variants = {
    primary: "bg-cyan-600 hover:bg-cyan-500 text-white border-l-4 border-cyan-300",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200 border-l-4 border-slate-500",
    danger: "bg-red-600 hover:bg-red-500 text-white border-l-4 border-red-300",
    ghost: "bg-transparent hover:bg-slate-800/50 text-cyan-400 border border-cyan-900/50"
  };

  const glowStyle = glow ? "shadow-[0_0_20px_rgba(6,182,212,0.5)]" : "";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${glowStyle} ${className}`}
      {...props}
    >
      {children}
      {/* Decorative corner accent */}
      <span className="absolute top-0 right-0 w-2 h-2 bg-white/20"></span>
      <span className="absolute bottom-0 left-0 w-2 h-2 bg-black/20"></span>
    </button>
  );
};

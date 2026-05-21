import React from 'react';
import { Layers } from 'lucide-react';

export const Logo: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 32 }) => {
  return (
    <div className={`flex items-center gap-3 font-bold tracking-tight ${className}`}>
      <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/20">
        <Layers size={size} className="text-white" strokeWidth={2.5} />
      </div>
      <span className="text-xl font-bold tracking-tight text-slate-800">
        Flowix <span className="text-brand-primary">Pro</span>
      </span>
    </div>
  );
};

import React from 'react';
import { Layers } from 'lucide-react';

export const Logo: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 32 }) => {
  return (
    <div className={`flex items-center gap-3 font-bold tracking-tight ${className}`}>
      <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-200">
        <Layers size={size} className="text-white" strokeWidth={2.5} />
      </div>
      <span className="text-xl font-bold tracking-tight text-slate-800">
        Flowix <span className="text-green-500">Pro</span>
      </span>
    </div>
  );
};

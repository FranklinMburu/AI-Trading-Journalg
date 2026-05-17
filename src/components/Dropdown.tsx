import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface DropdownOption {
  id: string;
  label: string;
  icon?: React.ElementType;
  description?: string;
  badge?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  triggerClassName?: string;
  align?: 'left' | 'right';
}

export default function Dropdown({ 
  options, 
  value, 
  onChange, 
  placeholder = 'Select option...', 
  label,
  className,
  triggerClassName,
  align = 'left'
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn("relative inline-block w-full text-left", className)} ref={containerRef}>
      {label && <label className="mb-1.5 block text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</label>}
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm transition-all hover:border-zinc-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500",
          triggerClassName
        )}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <selectedOption.icon size={16} className="text-zinc-500" />}
          <span className={cn("truncate font-medium", !selectedOption && "text-zinc-500")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
             <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
          )}
        </div>
        <ChevronDown size={14} className={cn("shrink-0 text-zinc-500 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
               "absolute z-50 mt-2 w-full min-w-[200px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl backdrop-blur-xl",
               align === 'right' ? "right-0" : "left-0"
            )}
          >
            <div className="max-h-[300px] overflow-y-auto p-1.5">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all",
                    value === option.id 
                      ? "bg-emerald-500/10 text-emerald-500" 
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  )}
                >
                  <div className="flex flex-1 flex-col items-start min-w-0">
                    <div className="flex items-center gap-2 w-full">
                       {option.icon && <option.icon size={14} className={cn(value === option.id ? "text-emerald-500" : "text-zinc-500")} />}
                       <span className="truncate font-medium">{option.label}</span>
                       {option.badge && (
                         <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                       )}
                    </div>
                    {option.description && (
                      <span className="truncate text-[10px] text-zinc-500 mt-0.5">{option.description}</span>
                    )}
                  </div>
                  {value === option.id && <Check size={14} className="shrink-0" />}
                </button>
              ))}
              {options.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-zinc-500 italic">
                  No options available
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

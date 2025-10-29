
import React, { useState, useRef, useEffect, ReactNode } from 'react';
import './ResizablePanel.css';

interface ResizablePanelProps {
  children: ReactNode;
  direction?: 'horizontal' | 'vertical';
  defaultSize?: number;
  minSize?: number;
  className?: string;
  onResize?: (size: number) => void;
  style?: React.CSSProperties;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  direction = 'horizontal',
  defaultSize = 300,
  minSize = 100,
  className = '',
  onResize,
  style
}) => {
  const [size, setSize] = useState(defaultSize);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0, size: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      if (direction === 'horizontal') {
        const deltaX = e.clientX - startPos.current.x;
        const newSize = startPos.current.size + deltaX;
        if (newSize >= minSize) {
          setSize(newSize);
          if (onResize) onResize(newSize);
        }
      } else {
        const deltaY = e.clientY - startPos.current.y;
        const newSize = startPos.current.size + deltaY;
        if (newSize >= minSize) {
          setSize(newSize);
          if (onResize) onResize(newSize);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, direction, minSize, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      size: size
    };
    setIsResizing(true);
    e.preventDefault();
  };

  const panelStyle = direction === 'horizontal' 
    ? { width: `${size}px`, ...(style || {}) }
    : { height: `${size}px`, ...(style || {}) };

  return (
    <div 
      ref={panelRef} 
      className={`resizable-panel ${direction} ${className}`}
      style={panelStyle}
    >
      {children}
      <div 
        className={`resize-handle ${direction}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

export default ResizablePanel;

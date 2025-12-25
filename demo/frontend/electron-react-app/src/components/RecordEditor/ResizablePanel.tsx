
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
        // 实时更新大小，即使小于minSize也更新，但在渲染时限制
        setSize(Math.max(minSize, newSize));
        if (onResize) onResize(Math.max(minSize, newSize));
      } else {
        const deltaY = e.clientY - startPos.current.y;
        const newSize = startPos.current.size + deltaY;
        // 实时更新大小，即使小于minSize也更新，但在渲染时限制
        setSize(Math.max(minSize, newSize));
        if (onResize) onResize(Math.max(minSize, newSize));
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
    e.stopPropagation();
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

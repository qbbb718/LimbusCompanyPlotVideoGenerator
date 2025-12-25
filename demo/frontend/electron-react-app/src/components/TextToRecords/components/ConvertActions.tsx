
import React from 'react';
import '../TextToRecords.css';

interface ConvertActionsProps {
  handleConvert: () => void;
  handleClear: () => void;
  isProcessing: boolean;
}

const ConvertActions: React.FC<ConvertActionsProps> = ({ 
  handleConvert, 
  handleClear, 
  isProcessing 
}) => {
  return (
    <div className="input-actions">
      <button
        onClick={handleConvert}
        disabled={isProcessing}
        className="convert-button"
      >
        {isProcessing ? '转换中...' : '转换为记录'}
      </button>
      <button onClick={handleClear} className="clear-button">清空</button>
    </div>
  );
};

export default ConvertActions;

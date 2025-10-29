
import React from 'react';
import '../TextToRecords.css';

interface ResultDisplayProps {
  result: string;
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ result }) => {
  if (!result) return null;

  return (
    <div className="result-container">
      <h3>转换结果</h3>
      <div className="result-message">{result}</div>
    </div>
  );
};

export default ResultDisplay;

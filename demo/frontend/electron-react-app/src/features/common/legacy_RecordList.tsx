import React, { useState, useEffect } from 'react';

interface Record {
  id: number;
  content: string;
  timestamp: string;
}

const RecordList: React.FC = () => {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      // 暂时使用模拟数据，稍后会连接后端
      const mockData: Record[] = [
        { id: 1, content: "示例记录1", timestamp: "2024-01-20" },
        { id: 2, content: "示例记录2", timestamp: "2024-01-21" }
      ];
      setRecords(mockData);
    } catch (error) {
      console.error('获取记录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>加载中...</div>;
  }

  return (
    <div className="record-list">
      <h2>记录列表</h2>
      <ul>
        {records.map(record => (
          <li key={record.id}>
            <div className="record-content">{record.content}</div>
            <div className="record-timestamp">{record.timestamp}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RecordList;

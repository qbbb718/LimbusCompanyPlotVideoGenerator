
const fs = require('fs');

// 读取新文件内容
const newContent = fs.readFileSync('./RecordEditor_new.tsx', 'utf8');

// 写入到旧文件
fs.writeFileSync('./RecordEditor.tsx', newContent);

console.log('文件替换完成');

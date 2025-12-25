
// 简单的脚本，用于生成应用图标
const fs = require('fs');
const path = require('path');

// 检查是否存在图标文件
const iconPath = path.join(__dirname, 'favicon.ico');
if (!fs.existsSync(iconPath)) {
  console.log('警告: 应用图标 favicon.ico 不存在');
  console.log('请添加一个 256x256 像素的 .ico 文件到 public 目录');
}

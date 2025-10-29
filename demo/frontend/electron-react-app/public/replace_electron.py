
import os

# 获取当前目录
current_dir = os.path.dirname(os.path.abspath(__file__))

# 定义文件路径
new_file = os.path.join(current_dir, 'electron_new.js')
target_file = os.path.join(current_dir, 'electron.js')

# 读取新文件内容
with open(new_file, 'r', encoding='utf-8') as f:
    content = f.read()

# 写入到目标文件
with open(target_file, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"成功将 {new_file} 的内容替换到 {target_file}")

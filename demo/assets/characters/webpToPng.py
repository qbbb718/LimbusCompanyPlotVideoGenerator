from PIL import Image
import os
import glob

def convert_webp_to_png(input_folder, output_folder):
    # 确保输出文件夹存在
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    
    # 查找所有.webp文件
    webp_files = glob.glob(os.path.join(input_folder, "*.webp"))
    
    for webp_file in webp_files:
        try:
            # 打开WebP图像
            with Image.open(webp_file) as img:
                # 生成输出文件名
                filename = os.path.basename(webp_file)
                png_filename = os.path.splitext(filename)[0] + ".png"
                output_path = os.path.join(output_folder, png_filename)
                
                # 转换为PNG并保存
                img.save(output_path, "PNG")
                print(f"转换成功: {filename} -> {png_filename}")
                
        except Exception as e:
            print(f"转换失败 {webp_file}: {e}")

# 使用示例
convert_webp_to_png(r"E:\LimbusCompanyPlotVideoGenerator\demo\src\main\resources\assets\characters", 
                    r"E:\LimbusCompanyPlotVideoGenerator\demo\src\main\resources\assets\characters")
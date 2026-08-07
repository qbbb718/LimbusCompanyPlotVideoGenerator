
import { useState, useRef } from 'react';
import { Portrait } from '@types';
import { blobToBase64 } from '../../../../../utils/imageUtils';
import createLogger from '../utils/logger';

const log = createLogger('useFileSelector');

interface UseFileSelectorProps {
  characterId: string;
  onFileSelected: (file: File, imagePath: string, baseName: string) => void;
  onPreviewSet: (imageUrl: string) => void;
  onCropReset: () => void;
}

export const useFileSelector = ({ characterId, onFileSelected, onPreviewSet, onCropReset }: UseFileSelectorProps) => {
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 优化后的文件选择函数，只使用一个对话框
  const selectImageFile = async () => {
    // 检查是否在Electron环境中
    if (window.electronAPI) {
      log('使用Electron文件选择对话框');

      // 使用electronAPI的openImageFile方法
      try {
        const result = await window.electronAPI.openImageFile();

        if (result && !result.canceled && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0];
          log('选择的文件路径', selectedPath);

          // 从路径中提取文件名
          const fileName = selectedPath.split(/[\\/]/).pop() || '';
          const fileExtension = fileName.split('.').pop() || '';
          const baseName = fileName.replace(`.${fileExtension}`, '');

          // 读取文件并设置预览
          try {
            // 在Electron环境中，使用electronAPI读取文件
            const fileBuffer = await window.electronAPI.readFile(selectedPath);
            const uint8Array = new Uint8Array(fileBuffer);
            const blob = new Blob([uint8Array]);
            const file = new File([blob], fileName, { type: `image/${fileExtension}` });

            // 使用FileReader读取文件
            const reader = new FileReader();
            reader.onload = (event) => {
              const imageUrl = event.target?.result as string;
              log('图片预览URL', imageUrl);
              onPreviewSet(imageUrl);
              onCropReset();
            };
            reader.readAsDataURL(file);

            // 处理文件路径
            let imagePath = '';

            // 检查路径是否包含characters文件夹
            const charactersIndex = selectedPath.lastIndexOf('characters');

            if (charactersIndex !== -1) {
              // 提取从characters开始的路径，并替换所有反斜杠为正斜杠
              const relativePath = selectedPath.substring(charactersIndex).replace(/\\/g, '/');

              // 如果文件直接在characters文件夹下，只使用文件名
              if (relativePath.indexOf('/') === -1 || relativePath.substring(relativePath.indexOf('/') + 1).indexOf('/') === -1) {
                // 文件直接在characters文件夹下或只有一级子目录
                imagePath = relativePath.includes('/') ? relativePath.substring(relativePath.indexOf('/') + 1) : relativePath;
              } else {
                // 文件在更深层的子目录中，保留完整路径
                imagePath = relativePath;
              }

              log('使用文件选择对话框获取的相对路径', imagePath);
            } else {
              // 如果不在characters文件夹下，只使用文件名
              imagePath = fileName;
              log('选择的图片不在characters文件夹下，只使用文件名', imagePath);
            }

            // 调用回调函数
            onFileSelected(file, imagePath, baseName);

          } catch (error) {
            console.error('读取文件错误:', error);
            log('读取文件失败，只使用文件名', fileName);

            // 创建一个虚拟文件对象
            const file = new File([], fileName, { type: `image/${fileExtension}` });
            onFileSelected(file, fileName, baseName);
          }
        } else {
          log('用户取消了文件选择');
        }
      } catch (error) {
        console.error('文件选择对话框错误:', error);
        log('文件选择对话框失败');
      }
    } else {
      // 非Electron环境，使用传统文件选择方式
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  // 传统的文件选择处理函数，仅在非Electron环境使用
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    log('选择立绘文件', file.name);

    // 读取文件并设置预览
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      onPreviewSet(imageUrl);
      onCropReset();
    };
    reader.readAsDataURL(file);

    // 获取文件路径
    let imagePath = (file as any).path || file.name;
    const fileName = file.name.replace(/\.[^/.]+$/, "");

    // 调用回调函数
    onFileSelected(file, imagePath, fileName);
  };

  return {
    portraitFile,
    setPortraitFile,
    fileInputRef,
    selectImageFile,
    handleFileSelect
  };
};

export default useFileSelector;

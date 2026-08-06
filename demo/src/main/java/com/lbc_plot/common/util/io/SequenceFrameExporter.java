package com.lbc_plot.common.util.io;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.List;

/**
 * 序列帧导出工具
 */
public class SequenceFrameExporter {

    /**
     * 导出图像序列到指定文件夹
     * 
     * @param frames    图像帧列表
     * @param outputDir 输出文件夹路径
     * @param format    图像格式（"png", "jpg"等）
     * @param prefix    文件名前缀
     * @throws IOException 导出失败时抛出
     */
    public static void exportAsImageSequence(
            List<BufferedImage> frames,
            String outputDir,
            String format,
            String prefix) throws IOException {
        exportAsImageSequence(frames, outputDir, format, prefix, 1);
    }

    /**
     * 导出图像序列到指定文件夹（带起始编号）
     * 
     * @param frames      图像帧列表
     * @param outputDir   输出文件夹路径
     * @param format      图像格式
     * @param prefix      文件名前缀
     * @param startNumber 起始编号
     * @throws IOException 导出失败时抛出
     */
    public static void exportAsImageSequence(
            List<BufferedImage> frames,
            String outputDir,
            String format,
            String prefix,
            int startNumber) throws IOException {

        // 创建输出目录
        File outputDirectory = new File(outputDir);
        if (!outputDirectory.exists()) {
            if (!outputDirectory.mkdirs()) {
                throw new IOException("无法创建输出目录: " + outputDir);
            }
        }

        // 确保目录可写
        if (!outputDirectory.canWrite()) {
            throw new IOException("输出目录不可写: " + outputDir);
        }

        // 导出每一帧
        for (int i = 0; i < frames.size(); i++) {
            BufferedImage frame = frames.get(i);
            int frameNumber = startNumber + i;

            // 生成文件名（保持固定位数，便于排序）
            String fileName = String.format("%s_%06d.%s", prefix, frameNumber, format);
            File outputFile = new File(outputDirectory, fileName);

            // 保存图像
            boolean success = ImageIO.write(frame, format, outputFile);
            if (!success) {
                throw new IOException("无法以格式 " + format + " 保存图像: " + outputFile.getAbsolutePath());
            }

            // 进度提示
            if ((i + 1) % 100 == 0 || (i + 1) == frames.size()) {
                System.out.printf("已导出 %d/%d 帧%n", i + 1, frames.size());
            }
        }

        System.out.println("序列帧导出完成: " + frames.size() + " 帧");
    }

    /**
     * 批量导出多个帧序列
     * 
     * @param frameSequences 多个帧序列（用于导出多个对话）
     * @param outputDir      输出文件夹路径
     * @param format         图像格式
     * @throws IOException 导出失败时抛出
     */
    public static void exportMultipleSequences(
            List<List<BufferedImage>> frameSequences,
            String outputDir,
            String format) throws IOException {

        int totalFrames = 0;
        for (int i = 0; i < frameSequences.size(); i++) {
            List<BufferedImage> sequence = frameSequences.get(i);
            String prefix = "scene_" + String.format("%03d", i + 1);
            exportAsImageSequence(sequence, outputDir, format, prefix);
            totalFrames += sequence.size();
        }

        System.out.println("所有序列导出完成，共 " + totalFrames + " 帧");
    }
}
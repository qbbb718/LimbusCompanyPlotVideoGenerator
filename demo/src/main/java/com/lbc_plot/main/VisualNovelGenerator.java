package com.lbc_plot.main;

import org.bytedeco.javacv.*;
import static org.bytedeco.ffmpeg.global.avcodec.AV_CODEC_ID_H264;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

//这部分可以是最后渲染用的？
//

public class VisualNovelGenerator {

    public static void main(String[] args) throws Exception {
        // 1. 准备素材路径
        String outputPath = "output.mp4";    // 输出视频
        
        // 2. 创建视频录制器 (1080p 30fps)
        FFmpegFrameRecorder recorder = new FFmpegFrameRecorder(
            outputPath, 1920, 1080);
        recorder.setVideoCodec(AV_CODEC_ID_H264);  // 使用导入的常量
        recorder.setFrameRate(30);
        recorder.start();

        // 3. 加载素材图片
        // 类路径加载（推荐！打包后也能工作）
        BufferedImage bg = ImageIO.read(
            VisualNovelGenerator.class.getResource("/assets/backgrounds/test_bg.png")
        );
        BufferedImage character = ImageIO.read(
            VisualNovelGenerator.class.getResource("/assets/characters/Gregor-default.png")
        );
        Java2DFrameConverter converter = new Java2DFrameConverter();  // 新增转换器
        
        // 4. 生成5秒视频（30fps * 5 = 150帧）
        for (int i = 0; i < 150; i++) {
            // 创建空白画布
            BufferedImage frame = new BufferedImage(1920, 1080, BufferedImage.TYPE_3BYTE_BGR);
            Graphics2D g = frame.createGraphics();
            
            // 分层绘制
            g.drawImage(bg, 0, 0, 1920, 1080, null);
            
            int charX = 1920 - character.getWidth() - 100;
            int charY = 1080 - character.getHeight() - 50;
            g.drawImage(character, charX, charY, null);
            
            g.setColor(new Color(0, 0, 0, 150));
            g.fillRoundRect(100, 800, 1720, 250, 20, 20);
            
            g.setColor(Color.WHITE);
            g.setFont(new Font("微软雅黑", Font.BOLD, 36));
            drawWrappedText(g, "这是角色对话文本示例...", 150, 850, 1700, 40);
            
            // 转换并提交帧
            org.bytedeco.javacv.Frame videoFrame = converter.convert(frame);  // 关键修改
            recorder.record(videoFrame);  // 现在参数类型正确
            g.dispose();
        }
        
        // 5. 完成录制
        recorder.stop();
        System.out.println("视频生成完成：" + outputPath);

        recorder.close();
        converter.close();
    }

    private static void drawWrappedText(Graphics g, String text, 
            int x, int y, int maxWidth, int lineHeight) {
        FontMetrics fm = g.getFontMetrics();
        String[] words = text.split(" ");
        StringBuilder currentLine = new StringBuilder();
        
        for (String word : words) {
            String testLine = currentLine + word + " ";
            if (fm.stringWidth(testLine) < maxWidth) {
                currentLine.append(word).append(" ");
            } else {
                g.drawString(currentLine.toString(), x, y);
                y += lineHeight;
                currentLine = new StringBuilder(word + " ");
            }
        }
        g.drawString(currentLine.toString(), x, y);
    }
}
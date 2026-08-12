package com.lbc_plot.common.util;

import org.bytedeco.ffmpeg.ffmpeg;
import org.bytedeco.ffmpeg.ffprobe;
import org.bytedeco.javacpp.Loader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Resolves FFmpeg / FFprobe binary paths from JavaCV's bundled native libraries.
 * <p>
 * All ffmpeg/ffprobe invocations should go through this resolver so the
 * application works without a system-installed FFmpeg on the user's PATH.
 */
public final class FFmpegPathResolver {

    private static final Logger logger = LoggerFactory.getLogger(FFmpegPathResolver.class);

    private static volatile String ffmpegPath;
    private static volatile String ffprobePath;

    private FFmpegPathResolver() {
    }

    /** @return absolute path to the JavaCV-bundled ffmpeg binary */
    public static String getFFmpegPath() {
        if (ffmpegPath == null) {
            synchronized (FFmpegPathResolver.class) {
                if (ffmpegPath == null) {
                    ffmpegPath = Loader.load(ffmpeg.class);
                    logger.info("Resolved bundled FFmpeg: {}", ffmpegPath);
                }
            }
        }
        return ffmpegPath;
    }

    /** @return absolute path to the JavaCV-bundled ffprobe binary */
    public static String getFFprobePath() {
        if (ffprobePath == null) {
            synchronized (FFmpegPathResolver.class) {
                if (ffprobePath == null) {
                    ffprobePath = Loader.load(ffprobe.class);
                    logger.info("Resolved bundled FFprobe: {}", ffprobePath);
                }
            }
        }
        return ffprobePath;
    }

    /**
     * Replace the leading {@code ffmpeg} / {@code ffprobe} command name with the
     * bundled binary path.  If the command does not start with either name it is
     * returned unchanged.
     */
    public static String resolveCommand(String command) {
        if (command.startsWith("ffmpeg ")) {
            return getFFmpegPath() + command.substring(6);
        }
        if (command.startsWith("ffprobe ")) {
            return getFFprobePath() + command.substring(7);
        }
        // handle exact match (no arguments)
        if (command.equals("ffmpeg")) {
            return getFFmpegPath();
        }
        if (command.equals("ffprobe")) {
            return getFFprobePath();
        }
        return command;
    }

    /**
     * Resolve a ProcessBuilder command array so that the first element
     * ({@code "ffmpeg"} or {@code "ffprobe"}) points to the bundled binary.
     */
    public static String[] resolveCommand(String[] command) {
        if (command == null || command.length == 0) {
            return command;
        }
        String[] resolved = command.clone();
        if ("ffmpeg".equals(resolved[0])) {
            resolved[0] = getFFmpegPath();
        } else if ("ffprobe".equals(resolved[0])) {
            resolved[0] = getFFprobePath();
        }
        return resolved;
    }
}

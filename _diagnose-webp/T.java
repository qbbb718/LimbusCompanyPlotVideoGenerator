public class T {
    public static void main(String[] a) {
        System.out.println("java.version=" + System.getProperty("java.version"));
        System.out.println("probe file=" + new java.io.File("output.webp").getAbsolutePath());
        try {
            Class<?> c = Class.forName("org.bytedeco.ffmpeg.global.avutil");
            System.out.println("[OK]   avutil class loaded: " + c.getName());
        } catch (Throwable t) {
            System.out.println("[FAIL] avutil: " + t);
        }
        try {
            Object g = Class.forName("org.bytedeco.javacv.FFmpegFrameGrabber")
                    .getConstructor(java.io.File.class).newInstance(new java.io.File("output.webp"));
            System.out.println("[OK]   FFmpegFrameGrabber constructed: " + g.getClass().getName());
        } catch (Throwable t) {
            System.out.println("[FAIL] FFmpegFrameGrabber: " + t);
            Throwable cause = t.getCause();
            while (cause != null) {
                System.out.println("       caused by: " + cause);
                cause = cause.getCause();
            }
        }
    }
}

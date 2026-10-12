public class T { public static void main(String[] a) {
  try { System.out.println("avutil LOADED ok, version=" + org.bytedeco.ffmpeg.global.avutil.class); }
  catch (Throwable t) { System.out.println("avutil FAILED: " + t); }
  try { org.bytedeco.javacv.FFmpegFrameGrabber g = new org.bytedeco.javacv.FFmpegFrameGrabber(new java.io.File("x.webp")); System.out.println("grabber ctor ok"); }
  catch (Throwable t) { System.out.println("grabber FAILED: " + t); }
} }

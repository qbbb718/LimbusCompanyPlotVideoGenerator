import java.io.File;
import java.net.URL;
import java.nio.file.Files;

/**
 * 复现 JavaCPP 的 Loader 加载原生库的方式：
 * 它把 "org/bytedeco/<lib>/<platform>/<lib>.dll" 当作 classpath 资源取出，
 * 再用 Files.copy(InputStream, Path) 落到缓存目录。
 * 因此只要该资源位于「未解包的 jar 内部」（Spring Boot 的 BOOT-INF/lib/xxx.jar），
 * 复制一定失败 —— 这正是安装版 WebP 解码整体失效的原因。
 */
public class N {
    public static void main(String[] args) throws Exception {
        String res = args[0];
        ClassLoader cl = N.class.getClassLoader();
        URL url = cl.getResource(res);
        System.out.println("  getResource(\"" + res + "\") = " + url);
        if (url == null) {
            System.out.println("  -> [FAIL] 资源不可见，原生库无法加载");
            return;
        }
        // 复刻 JavaCPP Loader 的落地动作
        File cache = new File(System.getProperty("java.io.tmpdir"), "javacpp-nested-probe");
        cache.mkdirs();
        File out = new File(cache, "probe.dll");
        out.delete();
        try (java.io.InputStream in = url.openStream()) {
            Files.copy(in, out.toPath());
            System.out.println("  -> [OK] 已复制 " + out.length() + " 字节到 " + out);
        } catch (Throwable t) {
            System.out.println("  -> [FAIL] 复制原生库失败: " + t);
        }
    }
}

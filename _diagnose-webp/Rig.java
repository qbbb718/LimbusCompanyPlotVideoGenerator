import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/**
 * Test-rig helper:
 *  1) extracts every BOOT-INF/lib/*.jar of the packaged fat jar into a staging dir
 *  2) writes a copy of the fat jar in which the platform native jars
 *     (javacpp/ffmpeg windows-x86_64) have been removed from BOOT-INF/lib
 * so the natives can then be supplied through -Dloader.path for controlled tests.
 */
public class Rig {
    public static void main(String[] args) throws Exception {
        String src = args[0];
        String stage = args[1];
        String outJar = args[2];

        Path stageDir = Paths.get(stage);
        Files.createDirectories(stageDir);

        Set<String> nativeNames = new HashSet<>(Arrays.asList(
                "javacpp-1.5.9-windows-x86_64.jar",
                "ffmpeg-6.0-1.5.9-windows-x86_64.jar"));

        Map<String, byte[]> entries = new LinkedHashMap<>();
        int extracted = 0;
        try (ZipFile zip = new ZipFile(src)) {
            Enumeration<? extends ZipEntry> en = zip.entries();
            while (en.hasMoreElements()) {
                ZipEntry e = en.nextElement();
                if (e.isDirectory()) continue;

                if (e.getName().startsWith("BOOT-INF/lib/")) {
                    byte[] data = readAll(zip.getInputStream(e));
                    String leaf = e.getName().substring("BOOT-INF/lib/".length());
                    if (leaf.endsWith(".jar")) {
                        Files.write(stageDir.resolve(leaf), data);
                        extracted++;
                    }
                    if (nativeNames.contains(leaf)) {
                        continue; // drop natives from the test jar
                    }
                    entries.put(e.getName(), data);
                    continue;
                }
                // keep the rest (loader classes, manifest, nested content) verbatim
                entries.put(e.getName(), readAll(zip.getInputStream(e)));
            }
        }

        try (ZipOutputStream out = new ZipOutputStream(new BufferedOutputStream(
                Files.newOutputStream(Paths.get(outJar))))) {
            for (Map.Entry<String, byte[]> e : entries.entrySet()) {
                ZipEntry ze = new ZipEntry(e.getKey());
                ze.setTime(0L);
                out.putNextEntry(ze);
                out.write(e.getValue());
                out.closeEntry();
            }
        }
        System.out.println("staged jars      : " + extracted + " -> " + stageDir);
        System.out.println("test jar written : " + outJar + " (" + entries.size() + " entries)");
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }
}

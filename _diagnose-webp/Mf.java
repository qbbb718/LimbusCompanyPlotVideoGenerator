import java.util.zip.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Prints the root MANIFEST.MF of a jar plus any Unpack- attributes found. */
public class Mf {
    public static void main(String[] args) throws Exception {
        try (ZipFile zip = new ZipFile(args[0])) {
            ZipEntry e = zip.getEntry("META-INF/MANIFEST.MF");
            if (e == null) { System.out.println("no root manifest"); return; }
            String text;
            try (InputStream in = zip.getInputStream(e)) {
                text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            System.out.println("---- root MANIFEST.MF ----");
            System.out.println(text);
            System.out.println("---- Unpack- attributes ----");
            int count = 0;
            for (String line : text.split("\r\n|\n")) {
                if (line.startsWith("Unpack-")) { System.out.println("  " + line); count++; }
            }
            System.out.println("total Unpack- entries: " + count);
        }
    }
}

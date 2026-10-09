package com.lbc_plot.util.text;

import com.lbc_plot.plot.model.Record;
import com.lbc_plot.plot.parser.PlainTextRecordsParser;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.CharacterService;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Arrays;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;
import com.lbc_plot.render.audio.model.AudioCommandType;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

public class PlainTextRecordsParserTest {

    @Test
    public void testParse_withCharacterService_andBgmPersistence() throws IOException {
        String content = "[bgm.mp3]\n" +
                "{bg.png}\n" +
                "Alice: Hello there(HAPPY)\n" +
                "Bob: Hi!\n" +
                "[bgm2.mp3]\n" +
                "Alice: Bye\n";

        Path tmp = Files.createTempFile("script", ".txt");
        Files.writeString(tmp, content);

        // mock CharacterService
        CharacterService svc = Mockito.mock(CharacterService.class);
        MyCharacter alice = MyCharacter.builder().characterID("alice-id").characterName("Alice").build();
        Portrait p = Portrait.builder("alice.png").portraitID("p1").characterID("alice-id").build();

        when(svc.searchCharactersByName("Alice")).thenReturn(List.of(alice));
        when(svc.findPortraitByEmotion(anyString(), anyString())).thenReturn(p);
        when(svc.getDefaultPortrait(alice)).thenReturn(p);

        List<Record> records = PlainTextRecordsParser.parse(tmp, svc);

        assertNotNull(records);
        System.out.println("TOTAL_RECORDS=" + records.size());
        // Debug: 输出每条 record 的音频命令并逐项打印每个命令的类型与音频ID字节信息
        for (int i = 0; i < records.size(); i++) {
            var r = records.get(i);
            System.out.println("REC[" + i + "] cmds=" + r.getAudioCommands());
            if (r.getAudioCommands() != null) {
            for (var c : r.getAudioCommands()) {
                String t = (c.getType() == null) ? "null" : c.getType().name();
                String id = c.getAudioId();
                int len = (id == null) ? -1 : id.length();
                String bytes = (id == null) ? "null" : Arrays.toString(id.getBytes(StandardCharsets.UTF_8));
                System.out.println("  cmd: type=" + t + " audioId='" + id + "' len=" + len + " bytes=" + bytes);
            }
            }
        }

        // [BGM] / {背景} 指令行不单独生成 record，而是附加到下一条对话上：
        // 3 条对话行 -> 3 条 record（原断言 >= 6 与实现不符，属过期断言）
        assertEquals(3, records.size(), "[BGM]/[背景] 指令行不应单独生成 record");

        // find first Alice record and check it has dialogue and speaker name
        boolean foundAlice = records.stream()
            .anyMatch(r -> r.getDialogue() != null && "Alice".equals(r.getDialogue().getSpeakerName()));
        assertTrue(foundAlice, "Alice dialogue should be present and mapped");

        // Validate BGM behavior: should contain active entries for both bgm.mp3 and bgm2.mp3
        boolean hasActive1 = false;
        boolean hasActive2 = false;
        for (int i = 0; i < records.size(); i++) {
            var r = records.get(i);
            if (r.getAudioCommands() == null) continue;
            for (var c : r.getAudioCommands()) {
                // debug: print enum identity & classloader to detect duplicate-classloader issues
                if (c.getType() != null) {
                    System.out.println("  typeClass=" + c.getType().getClass().getName());
                    System.out.println("  typeClassLoader=" + c.getType().getClass().getClassLoader());
                    System.out.println("  typeIdentity=" + System.identityHashCode(c.getType()));
                    System.out.println("  expectedIdentity=" + System.identityHashCode(AudioCommandType.BGM_ACTIVE));
                    System.out.println("  equals? " + c.getType().equals(AudioCommandType.BGM_ACTIVE));
                    System.out.println("  == ? " + (c.getType() == AudioCommandType.BGM_ACTIVE));
                } else {
                    System.out.println("  type=null");
                }
                String aid = c.getAudioId();
                System.out.println("  audioId raw='" + aid + "' len=" + (aid==null?-1:aid.length()));
                System.out.println("  audioId bytes=" + (aid==null?"null":Arrays.toString(aid.getBytes(StandardCharsets.UTF_8))));

                boolean match1 = c.getType() == AudioCommandType.BGM_ACTIVE && "bgm.mp3".equals(c.getAudioId());
                boolean match2 = c.getType() == AudioCommandType.BGM_ACTIVE && "bgm2.mp3".equals(c.getAudioId());
                System.out.println("  check cmd: type=" + (c.getType()==null?"null":c.getType().name()) + " id='" + c.getAudioId() + "' => match1=" + match1 + " match2=" + match2);
                if (match1) hasActive1 = true;
                if (match2) hasActive2 = true;
            }
        }

        System.out.println("DBG hasActive1=" + hasActive1 + " hasActive2=" + hasActive2);
        assertTrue(hasActive1, "Should contain BGM_ACTIVE for bgm.mp3");
        assertTrue(hasActive2, "Should contain BGM_ACTIVE for bgm2.mp3 after change");
    }
}

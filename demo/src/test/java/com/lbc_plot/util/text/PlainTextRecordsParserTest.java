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

import static org.junit.jupiter.api.Assertions.*;
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
        // expecting at least: bgm start, bg change, alice line, bob line, bgm2 change,
        // alice line
        assertTrue(records.size() >= 6);

        // find first Alice record and check it has dialogue and speaker name
        boolean foundAlice = records.stream()
                .anyMatch(r -> r.getDialogue() != null && "Alice".equals(r.getDialogue().getSpeakerName()));
        assertTrue(foundAlice, "Alice dialogue should be present and mapped");

        // check BGM persistence: after first [bgm.mp3], subsequent records before bgm2
        // should include bgm start
        // find index of first BGM start
        int idxBgm1 = -1;
        for (int i = 0; i < records.size(); i++) {
            if (records.get(i).getAudioCommands() != null && records.get(i).getAudioCommands().stream()
                    .anyMatch(ac -> ac.getType() != null && ac.getType().name().startsWith("BGM"))) {
                idxBgm1 = i;
                break;
            }
        }
        assertTrue(idxBgm1 >= 0, "Should have a BGM start record");

        // ensure records after idxBgm1 and before bgm2 still contain a BGM_START with
        // same id
        String bgmId = records.get(idxBgm1).getAudioCommands().get(0).getAudioId();
        boolean persisted = false;
        for (int i = idxBgm1 + 1; i < records.size(); i++) {
            var cmds = records.get(i).getAudioCommands();
            if (cmds != null) {
                for (var c : cmds) {
                    if (c.getType() != null && c.getType().name().equals("BGM_START") && bgmId.equals(c.getAudioId())) {
                        persisted = true;
                        break;
                    }
                }
            }
            if (persisted)
                break;
        }

        assertTrue(persisted, "BGM should persist into subsequent records until changed");
    }
}

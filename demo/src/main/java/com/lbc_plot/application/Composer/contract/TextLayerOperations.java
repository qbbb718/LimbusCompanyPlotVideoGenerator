package com.lbc_plot.application.Composer.contract;

import java.awt.Color;

public interface TextLayerOperations {
    void addLocationText(String text);
    void addCharacterNameText(String text,  Color color);
    void addFactionText(String text);
    void addDialogueTextLeft(String text);
    void addDialogueTextCenter(String text);
}
package com.lbc_plot.application.Composer.contract;

import java.awt.Dimension;
import java.awt.image.BufferedImage;

public interface CompositionInterface {
    BufferedImage compose();
    void clearLayers();
    Dimension getCompositionSize();
    int getLayerCount();
    void setOutputSize(int width, int height);
    void resetToDefaultSize();
}
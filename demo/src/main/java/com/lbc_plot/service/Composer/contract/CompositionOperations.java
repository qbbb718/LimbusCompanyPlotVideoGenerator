package com.lbc_plot.service.Composer.contract;

import java.awt.Dimension;
import java.awt.image.BufferedImage;

public interface CompositionOperations {
    BufferedImage compose();
    void clearLayers();
    Dimension getCompositionSize();
    int getLayerCount();
    void setOutputSize(int width, int height);
    void resetToDefaultSize();
}
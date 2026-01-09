package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {
    private String storageLocation;
    private int renderThreads = 4;
    private boolean cacheEnabled = true;

    public String getStorageLocation() {
        return storageLocation;
    }

    public void setStorageLocation(String storageLocation) {
        this.storageLocation = storageLocation;
    }

    public int getRenderThreads() {
        return renderThreads;
    }

    public void setRenderThreads(int renderThreads) {
        this.renderThreads = renderThreads;
    }

    public boolean isCacheEnabled() {
        return cacheEnabled;
    }

    public void setCacheEnabled(boolean cacheEnabled) {
        this.cacheEnabled = cacheEnabled;
    }
}

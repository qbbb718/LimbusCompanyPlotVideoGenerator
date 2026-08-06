package com.lbc_plot.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@Configuration
@EnableConfigurationProperties(ProjectProperties.class)
public class ProjectConfigBinder {
    private final ProjectProperties props;
    private final ProjectConfig projectConfig;

    @Autowired
    public ProjectConfigBinder(ProjectProperties props, ProjectConfig projectConfig) {
        this.props = props;
        this.projectConfig = projectConfig;
    }

    @PostConstruct
    public void bind() {
        if (props == null) return;
        // set a few common properties; ProjectConfig will copy instance values to static fields
        try {
            projectConfig.setVideoWidth(props.getVideoWidth());
            projectConfig.setVideoHeight(props.getVideoHeight());
            projectConfig.setFrameRate(props.getFrameRate());
            if (props.getImageBasePath() != null) projectConfig.setImageBasePath(props.getImageBasePath());
            if (props.getDefaultTextColor() != null) projectConfig.setDefaultTextColor(props.getDefaultTextColor());
            if (props.getDefaultBgColor() != null) projectConfig.setDefaultBgColor(props.getDefaultBgColor());
            if (props.getFactionColor() != null) projectConfig.setFactionColor(props.getFactionColor());
            // re-run init to update static fields
            projectConfig.init();
        } catch (Exception e) {
            // best-effort
        }
    }
}

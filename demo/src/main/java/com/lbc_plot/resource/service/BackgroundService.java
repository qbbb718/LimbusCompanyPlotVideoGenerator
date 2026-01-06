package com.lbc_plot.resource.service;

import java.util.List;
import java.util.Optional;

import com.lbc_plot.resource.model.Background;

public interface BackgroundService {
    Optional<Background> findById(String id);

    Optional<Background> findByPath(String path);

    Background findOrCreateByPath(String path, String displayName, String source);

    List<Background> findAll();
}

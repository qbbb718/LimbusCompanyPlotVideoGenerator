package com.lbc_plot.core.service;

import com.lbc_plot.model.storage.Background;
import java.util.List;
import java.util.Optional;

public interface BackgroundService {
    Optional<Background> findById(String id);
    Optional<Background> findByPath(String path);
    Background findOrCreateByPath(String path, String displayName, String source);
    List<Background> findAll();
}

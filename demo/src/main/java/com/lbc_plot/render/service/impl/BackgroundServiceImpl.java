package com.lbc_plot.render.service.impl;

import com.lbc_plot.resource.dao.BackgroundDAO;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.service.BackgroundService;

import java.util.List;
import java.util.Optional;

public class BackgroundServiceImpl implements BackgroundService {
    private final BackgroundDAO backgroundDAO;

    public BackgroundServiceImpl(BackgroundDAO backgroundDAO) {
        this.backgroundDAO = backgroundDAO;
    }

    @Override
    public Optional<Background> findById(String id) {
        return backgroundDAO.findById(id);
    }

    @Override
    public Optional<Background> findByPath(String path) {
        return backgroundDAO.findByPath(path);
    }

    @Override
    public Optional<Background> findByName(String displayName) {
        return backgroundDAO.findByName(displayName);
    }

    @Override
    public Background findOrCreateByPath(String path, String displayName, String source) {
        return backgroundDAO.findOrCreateByPath(path, displayName, source);
    }

    @Override
    public List<Background> findAll() {
        return backgroundDAO.findAll();
    }
}

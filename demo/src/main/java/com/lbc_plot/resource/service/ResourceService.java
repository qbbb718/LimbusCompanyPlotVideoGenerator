package com.lbc_plot.resource.service;

import java.util.List;

public interface ResourceService<T> {
    T getById(String id);

    List<T> listAll();

    T save(T entity);

    void delete(String id);
}

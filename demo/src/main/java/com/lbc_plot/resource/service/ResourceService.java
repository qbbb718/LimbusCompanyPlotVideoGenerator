package com.lbc_plot.resource.service;

import java.util.List;

public interface ResourceService<T> {
    T getById(long id);
    List<T> listAll();
    void save(T entity);
    void delete(long id);
}

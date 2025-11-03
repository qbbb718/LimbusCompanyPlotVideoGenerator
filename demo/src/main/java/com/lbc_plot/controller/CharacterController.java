package com.lbc_plot.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.logging.Logger;
import java.io.File;
import java.nio.file.Paths;
import java.nio.file.Files;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.PortraitDAO;
import org.jdbi.v3.core.Jdbi;

/**
 * 角色API控制器
 */
@RestController
@RequestMapping("/api")
public class CharacterController {
    
    @Autowired
    private Jdbi jdbi;

    /**
     * 获取所有角色
     */
    @GetMapping("/characters")
    public List<MyCharacter> getCharacters() {
        try {
            return jdbi.withExtension(CharacterDAO.class, dao -> dao.getAllCharacters());
        } catch (Exception e) {
            System.err.println("获取角色失败: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 添加新角色
     */
    @PostMapping("/characters")
    public MyCharacter addCharacter(@RequestBody MyCharacter character) {
        try {
            jdbi.useExtension(CharacterDAO.class, dao -> dao.addCharacter(character));
            return character;
        } catch (Exception e) {
            System.err.println("添加角色失败: " + e.getMessage());
            throw new RuntimeException("添加角色失败: " + e.getMessage());
        }
    }

    /**
     * 更新角色
     */
    @PutMapping("/characters/{id}")
    public MyCharacter updateCharacter(@PathVariable String id, @RequestBody MyCharacter character) {
        try {
            character.setCharacterID(id);
            jdbi.useExtension(CharacterDAO.class, dao -> dao.updateCharacter(character));
            return character;
        } catch (Exception e) {
            System.err.println("更新角色失败: " + e.getMessage());
            throw new RuntimeException("更新角色失败: " + e.getMessage());
        }
    }

    /**
     * 删除角色
     */
    @DeleteMapping("/characters/{id}")
    public void deleteCharacter(@PathVariable String id, @RequestParam(required = false, defaultValue = "false") boolean deleteFiles) {
        try {
            jdbi.useExtension(CharacterDAO.class, dao -> dao.deleteCharacter(id, deleteFiles));
        } catch (Exception e) {
            System.err.println("删除角色失败: " + e.getMessage());
            throw new RuntimeException("删除角色失败: " + e.getMessage());
        }
    }

    /**
     * 添加立绘
     */
    @PostMapping("/characters/{characterId}/portraits")
    public Portrait addPortrait(@PathVariable String characterId, @RequestBody Portrait portrait) {
        try {
            portrait.setCharacterID(characterId);
            jdbi.useExtension(PortraitDAO.class, dao -> dao.addPortrait(portrait));
            return portrait;
        } catch (Exception e) {
            System.err.println("添加立绘失败: " + e.getMessage());
            throw new RuntimeException("添加立绘失败: " + e.getMessage());
        }
    }

    /**
     * 更新立绘
     */
    @PutMapping("/characters/{characterId}/portraits/{portraitId}")
    public Portrait updatePortrait(@PathVariable String characterId, @PathVariable String portraitId, @RequestBody Portrait portrait) {
        try {
            portrait.setCharacterID(characterId);
            portrait.setPortraitID(portraitId);
            jdbi.useExtension(PortraitDAO.class, dao -> dao.updatePortrait(portrait));
            return portrait;
        } catch (Exception e) {
            System.err.println("更新立绘失败: " + e.getMessage());
            throw new RuntimeException("更新立绘失败: " + e.getMessage());
        }
    }

    /**
     * 删除立绘
     */
    @DeleteMapping("/characters/{characterId}/portraits/{portraitId}")
    public void deletePortrait(@PathVariable String characterId, @PathVariable String portraitId) {
        try {
            jdbi.useExtension(PortraitDAO.class, dao -> dao.deletePortrait(portraitId));
        } catch (Exception e) {
            System.err.println("删除立绘失败: " + e.getMessage());
            throw new RuntimeException("删除立绘失败: " + e.getMessage());
        }
    }
}

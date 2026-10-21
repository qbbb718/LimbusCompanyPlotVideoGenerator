package com.lbc_plot.resource.service;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.jdbi.v3.core.Jdbi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.config.AppConfig;
import com.lbc_plot.resource.dao.AudioDAO;
import com.lbc_plot.resource.dao.BackgroundDAO;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.CharacterMapper;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.Audio;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * @module 资源管理模块
 * @function 资源导入导出服务
 *
 * <p>把「角色 / 背景 / 音频」三类资源统一打包成 ZIP 导入导出，供资源管理页面的
 * 「多选导出」「导入」以及页面顶部的「全部资源导入导出」共用。
 *
 * <h2>为什么集中在一个服务里</h2>
 * 角色原本在 {@code CharacterController} 里自带了导入导出实现，背景与音频没有。
 * 如果每类资源各写一份（再加上"全部资源"再各写一份），同一种 ZIP 结构就会出现多份实现，
 * 任何一处改动（文件名规则、ID 冲突处理）都容易漂移。这里把它们收敛成：
 * <ul>
 *   <li>{@link #exportCharacters}/{@link #importCharacters} 等单类型方法：ZIP 根目录放
 *       {@code characters.json}（或 backgrounds/audios.json）+ 素材文件；</li>
 *   <li>{@link #exportAll}/{@link #importAll}：把三类包分别放进 {@code characters/}、
 *       {@code backgrounds/}、{@code audios/} 三个顶级目录，并附一个 {@code manifest.json}。</li>
 * </ul>
 * 两类包结构互相兼容：全部资源包是按类型前缀调用同一套单类型实现打包/解包的。
 *
 * <h2>内存与临时文件</h2>
 * 素材动辄几百 MB，"全部资源"包可能上 GB，所以导入导出全程流式处理：
 * 导出用 {@link ZipWriter} 边读盘边写 ZIP；导入先扫描一遍 ZIP 取清单与条目名，
 * 再按需把命中的文件流式落盘，绝不把整个 ZIP 读进内存。
 * 临时 ZIP 由调用方（控制器）在响应/导入结束后删除。
 */
@Service
public class ResourceTransferService {

    private static final Logger logger = LoggerFactory.getLogger(ResourceTransferService.class);

    /** 单类型资源包内的清单文件名 */
    public static final String CHARACTERS_MANIFEST = "characters.json";
    public static final String BACKGROUNDS_MANIFEST = "backgrounds.json";
    public static final String AUDIOS_MANIFEST = "audios.json";

    /** "全部资源"包内的清单文件名 */
    public static final String BUNDLE_MANIFEST = "manifest.json";

    /** "全部资源"包内的三个顶级目录 */
    public static final String CHARACTERS_PREFIX = "characters/";
    public static final String BACKGROUNDS_PREFIX = "backgrounds/";
    public static final String AUDIOS_PREFIX = "audios/";

    /**
     * 全部资源包的格式版本。
     * 以后若调整包结构，把这个数字 +1；导入端遇到比它大的版本会直接拒绝，
     * 而不是"导入到一半才发现字段不认识"。
     */
    public static final int BUNDLE_FORMAT_VERSION = 1;

    /** 已知的清单文件名，扫描 ZIP 时顺带读进内存（都是小文件） */
    private static final Set<String> MANIFEST_FILE_NAMES = Set.of(
            CHARACTERS_MANIFEST, BACKGROUNDS_MANIFEST, AUDIOS_MANIFEST, BUNDLE_MANIFEST);

    @Autowired
    private AppConfig appConfig;

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private CharacterFolderService characterFolderService;

    // ==================================================================
    // 上传落盘 / 临时文件
    // ==================================================================

    /**
     * 把上传的 ZIP 暂存到临时目录。
     *
     * <p>导入需要把同一个 ZIP 读两遍（先取清单、再落盘文件），而 MultipartFile 的输入流
     * 只能读一次，所以先落成临时文件；调用方负责在 finally 里删除。
     *
     * @param file       上传的 ZIP
     * @param tempPrefix 临时文件名前缀，便于排障时认出是哪个接口产生的
     * @return 临时文件路径
     */
    public static Path saveUploadedZip(MultipartFile file, String tempPrefix) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("上传的资源包为空");
        }
        Path tempZip = Files.createTempFile(tempPrefix, ".zip");
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, tempZip, StandardCopyOption.REPLACE_EXISTING);
        }
        return tempZip;
    }

    /** 删除临时文件，失败只记日志（不影响已经完成的结果） */
    public static void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            logger.warn("删除临时文件失败: {} ({})", path, e.getMessage());
        }
    }

    // ==================================================================
    // 角色
    // ==================================================================

    /**
     * @function 导出角色为临时 ZIP
     * @param characterIds 要导出的角色 ID；为空表示导出全部
     * @return 临时 ZIP 路径（调用方负责删除）
     */
    public Path exportCharacters(List<String> characterIds) throws IOException {
        List<MyCharacter> characters = loadCharacters(characterIds);
        String charactersDir = appConfig.getAssets().getCharacters();
        Path zip = Files.createTempFile("characters_export_", ".zip");

        try (ZipWriter writer = new ZipWriter(zip)) {
            writer.writeBytes(CHARACTERS_MANIFEST,
                    createJsonMapper().writeValueAsBytes(characters));

            for (MyCharacter character : characters) {
                String folderName = character.getFolderName();
                if (folderName == null || folderName.isEmpty() || character.getPortraits() == null) {
                    // 没有目录名的角色（历史脏数据）里面的立绘文件本来就定位不到，跳过
                    continue;
                }
                for (Portrait portrait : character.getPortraits()) {
                    // 立绘原图：imagePath 是相对 characters 目录的路径
                    String imagePath = portrait.getImagePath();
                    if (imagePath != null && !imagePath.isEmpty()) {
                        File imageFile = new File(charactersDir, imagePath);
                        writer.writeFile(folderName + "/" + imageFile.getName(), imageFile);
                    }
                    // 缩略图：thumbnailPath 是 /assets/... 形式的 URL 路径
                    String thumbnailPath = portrait.getThumbnailPath();
                    if (thumbnailPath != null && !thumbnailPath.isEmpty()) {
                        File thumbnailFile = resolveAssetFile(thumbnailPath);
                        if (thumbnailFile != null) {
                            writer.writeFile(folderName + "/thumbnails/" + thumbnailFile.getName(),
                                    thumbnailFile);
                        }
                    }
                }
            }
        } catch (IOException e) {
            deleteQuietly(zip);
            throw e;
        }

        logger.info("导出角色完成: {} 个", characters.size());
        return zip;
    }

    /**
     * @function 从 ZIP 导入角色（单个资源包，清单在根目录）
     */
    public List<MyCharacter> importCharacters(Path zipFile) throws IOException {
        return importCharacters(zipFile, "", scanZip(zipFile));
    }

    /**
     * @function 从 ZIP 导入角色（可指定资源类型目录前缀）
     * @param zipFile     已落盘的 ZIP
     * @param entryPrefix 条目前缀（"" 表示清单在 ZIP 根目录；"characters/" 表示"全部资源"包）
     * @param scan        该 ZIP 的扫描结果（避免重复扫描）
     */
    List<MyCharacter> importCharacters(Path zipFile, String entryPrefix, ZipScan scan) throws IOException {
        String charactersJson = scan.manifests.get(entryPrefix + CHARACTERS_MANIFEST);
        if (charactersJson == null) {
            throw new IllegalArgumentException("无效的角色导出文件：缺少 " + CHARACTERS_MANIFEST);
        }

        ObjectMapper mapper = createJsonMapper();
        List<MyCharacter> importedCharacters = mapper.readValue(charactersJson,
                mapper.getTypeFactory().constructCollectionType(List.class, MyCharacter.class));

        String charactersDir = appConfig.getAssets().getCharacters();
        String thumbnailsSubdir = appConfig.getAssets().getCharacterThumbnailsSubdir();
        String timestamp = String.valueOf(System.currentTimeMillis());

        List<MyCharacter> result = new ArrayList<>();
        // ZIP 内条目名 → 落盘目标路径；文件在第二遍扫描时按此表流式写出
        Map<String, Path> fileTargets = new HashMap<>();

        for (int i = 0; i < importedCharacters.size(); i++) {
            MyCharacter character = importedCharacters.get(i);
            String oldFolderName = character.getFolderName();
            String originalId = character.getCharacterID();

            // ID 冲突（或缺失）时分配新 ID：导入是"复制"，不能悄悄覆盖本机已有角色
            String newCharacterId = originalId;
            if (originalId == null || originalId.isEmpty() || characterExists(originalId)) {
                newCharacterId = "char_import_" + timestamp + "_" + i;
                logger.info("角色 ID 冲突或缺失，已分配新 ID: {} → {}", originalId, newCharacterId);
                character.setCharacterID(newCharacterId);
            }

            String newFolderName = characterFolderService.resolveOrCreateFolder(newCharacterId);
            character.setFolderName(newFolderName);

            // 名片路径里带着角色 ID（/api/character-card/{id}）：分配新 ID 后必须跟着改，
            // 否则导入的角色会去请求"旧 ID"的名片
            if (character.getCharacterCardImagePath() != null
                    && !character.getCharacterCardImagePath().isEmpty()) {
                character.setCharacterCardImagePath("/api/character-card/" + newCharacterId);
            }

            if (character.getPortraits() != null) {
                for (Portrait portrait : character.getPortraits()) {
                    portrait.setCharacterID(newCharacterId);

                    // 立绘 ID 冲突时同样换新 ID
                    String originalPortraitId = portrait.getPortraitID();
                    if (originalPortraitId == null || originalPortraitId.isEmpty()
                            || portraitExists(originalPortraitId)) {
                        portrait.setNewPortraitID();
                        logger.info("立绘 ID 冲突或缺失，已生成新 ID: {} → {}",
                                originalPortraitId, portrait.getPortraitID());
                    }

                    // setImagePath() 会把 thumbnailPath 清空，先把 JSON 里的缩略图路径取出来
                    String jsonThumbnailPath = portrait.getThumbnailPath();

                    // 1) 立绘原图
                    String oldImageName = fileNameOf(portrait.getImagePath());
                    String imageEntry = joinEntry(entryPrefix, oldFolderName, oldImageName);
                    if (imageEntry != null && scan.fileEntries.contains(imageEntry)) {
                        String extension = extensionOf(oldImageName, ".png");
                        String newFileName = portrait.getPortraitID() + extension;
                        fileTargets.put(imageEntry,
                                Paths.get(charactersDir, newFolderName, newFileName));
                        portrait.setImagePath(newFolderName + "/" + newFileName);
                    } else {
                        if (portrait.getImagePath() != null) {
                            logger.warn("ZIP 中未找到立绘文件: {}，已清除立绘路径", imageEntry);
                        }
                        portrait.setImagePath(null);
                    }

                    // 2) 立绘缩略图（用刚才保存的 jsonThumbnailPath，imagePath 的 setter 已清空它）
                    String oldThumbnailName = fileNameOf(jsonThumbnailPath);
                    String thumbnailEntry = joinEntry(entryPrefix, oldFolderName,
                            oldThumbnailName == null ? null : "thumbnails/" + oldThumbnailName);
                    if (thumbnailEntry != null && scan.fileEntries.contains(thumbnailEntry)) {
                        String newThumbnailName = "thumbnail_" + portrait.getPortraitID() + ".png";
                        fileTargets.put(thumbnailEntry, Paths.get(charactersDir, newFolderName,
                                thumbnailsSubdir, newThumbnailName));
                        portrait.setThumbnailPath("/assets/characters/" + newFolderName + "/"
                                + thumbnailsSubdir + "/" + newThumbnailName);
                    } else {
                        if (jsonThumbnailPath != null && !jsonThumbnailPath.isEmpty()) {
                            logger.warn("ZIP 中未找到缩略图: {}，已清除缩略图路径", thumbnailEntry);
                        }
                        portrait.setThumbnailPath(null);
                    }
                }
            }

            result.add(character);
        }

        // 先把文件落盘，再写数据库：避免"库里已有记录、文件却不存在"的半成品
        restoreZipFiles(zipFile, fileTargets);
        saveCharacters(result);

        logger.info("导入角色完成: {} 个", result.size());
        return result;
    }

    /** 把导入的角色与立绘写入数据库（沿用原有的事务粒度：一个角色一个事务） */
    private void saveCharacters(List<MyCharacter> characters) {
        for (MyCharacter character : characters) {
            jdbi.inTransaction(handle -> {
                CharacterDAO characterDao = handle.attach(CharacterDAO.class);
                PortraitDAO portraitDao = handle.attach(PortraitDAO.class);

                characterDao.addCharacter(character);

                // addCharacter 不写 character_card_image_path（导入后该列为 NULL），这里补一次：
                // 名片图由 GET /api/character-card/{id} 按需渲染，补上路径后导入的角色在
                // 「名片预览」里就能直接显示，不必先手动点一次保存
                if (character.getCharacterCardImagePath() != null
                        && !character.getCharacterCardImagePath().isEmpty()) {
                    characterDao.updateCardImagePath(character.getCharacterID(),
                            character.getCharacterCardImagePath());
                }

                // 重复导入时先清掉该 ID 的旧立绘记录，避免残留
                portraitDao.deleteCharacterPortraits(character.getCharacterID());
                portraitDao.deleteByCharacterId(character.getCharacterID());

                if (character.getPortraits() != null && !character.getPortraits().isEmpty()) {
                    for (Portrait portrait : character.getPortraits()) {
                        portraitDao.save(portrait);
                    }
                    portraitDao.saveCharacterPortraits(
                            character.getCharacterID(), character.getPortraits());
                }
                return null;
            });
            logger.info("已导入角色: {} (ID: {})",
                    character.getCharacterName(), character.getCharacterID());
        }
    }

    // ==================================================================
    // 背景
    // ==================================================================

    /**
     * @function 导出背景为临时 ZIP
     * @param backgroundIds 要导出的背景 ID；为空表示导出全部
     */
    public Path exportBackgrounds(List<String> backgroundIds) throws IOException {
        List<Background> backgrounds = loadBackgrounds(backgroundIds);
        Path zip = Files.createTempFile("backgrounds_export_", ".zip");

        try (ZipWriter writer = new ZipWriter(zip)) {
            writer.writeBytes(BACKGROUNDS_MANIFEST,
                    createJsonMapper().writeValueAsBytes(backgrounds));

            for (Background background : backgrounds) {
                // 每张背景一个以 uuid 命名的目录：原图放目录下，缩略图放 thumbnails/ 子目录
                String folder = entryFolder(background.getUuid());

                File imageFile = resolveAssetFile(background.getPath());
                if (imageFile != null) {
                    writer.writeFile(folder + imageFile.getName(), imageFile);
                }

                File thumbnailFile = resolveAssetFile(background.getThumbnailPath());
                if (thumbnailFile != null) {
                    writer.writeFile(folder + "thumbnails/" + thumbnailFile.getName(), thumbnailFile);
                }
            }
        } catch (IOException e) {
            deleteQuietly(zip);
            throw e;
        }

        logger.info("导出背景完成: {} 张", backgrounds.size());
        return zip;
    }

    /** @function 从 ZIP 导入背景（单个资源包，清单在根目录） */
    public List<Background> importBackgrounds(Path zipFile) throws IOException {
        return importBackgrounds(zipFile, "", scanZip(zipFile));
    }

    List<Background> importBackgrounds(Path zipFile, String entryPrefix, ZipScan scan) throws IOException {
        String backgroundsJson = scan.manifests.get(entryPrefix + BACKGROUNDS_MANIFEST);
        if (backgroundsJson == null) {
            throw new IllegalArgumentException("无效的背景导出文件：缺少 " + BACKGROUNDS_MANIFEST);
        }

        ObjectMapper mapper = createJsonMapper();
        List<Background> importedBackgrounds = mapper.readValue(backgroundsJson,
                mapper.getTypeFactory().constructCollectionType(List.class, Background.class));

        Path backgroundsDir = RuntimePaths.getBackgroundsDir();
        Path thumbnailsDir = backgroundsDir.resolve("thumbnails");
        Files.createDirectories(backgroundsDir);

        String timestamp = String.valueOf(System.currentTimeMillis());
        List<Background> result = new ArrayList<>();
        Map<String, Path> fileTargets = new HashMap<>();

        for (int i = 0; i < importedBackgrounds.size(); i++) {
            Background background = importedBackgrounds.get(i);
            String oldFolder = entryFolder(background.getUuid());

            // 同角色：ID 冲突时换新 ID，导入只新增不覆盖
            String newUuid = background.getUuid();
            if (newUuid == null || newUuid.isEmpty() || backgroundExists(newUuid)) {
                newUuid = "bg_import_" + timestamp + "_" + i;
                logger.info("背景 ID 冲突或缺失，已分配新 ID: {} → {}",
                        background.getUuid(), newUuid);
            }
            background.setUuid(newUuid);

            if (background.getName() == null || background.getName().trim().isEmpty()) {
                background.setName("导入的背景_" + (i + 1));
            }

            // 1) 原图
            String oldImageName = fileNameOf(background.getPath());
            String imageEntry = oldImageName == null ? null : entryPrefix + oldFolder + oldImageName;
            if (imageEntry != null && scan.fileEntries.contains(imageEntry)) {
                String newFileName = stemOf(oldImageName) + "_import_" + timestamp + "_" + i
                        + extensionOf(oldImageName, ".png");
                fileTargets.put(imageEntry, backgroundsDir.resolve(newFileName));
                background.setPath("/assets/backgrounds/" + newFileName);
            } else {
                logger.warn("ZIP 中未找到背景原图: {}，已清除原图路径", imageEntry);
                background.setPath(null);
            }

            // 2) 缩略图
            String oldThumbnailName = fileNameOf(background.getThumbnailPath());
            String thumbnailEntry = oldThumbnailName == null ? null
                    : entryPrefix + oldFolder + "thumbnails/" + oldThumbnailName;
            if (thumbnailEntry != null && scan.fileEntries.contains(thumbnailEntry)) {
                String newThumbnailName = "thumb_" + newUuid + "_" + timestamp + "_" + i
                        + extensionOf(oldThumbnailName, ".jpg");
                fileTargets.put(thumbnailEntry, thumbnailsDir.resolve(newThumbnailName));
                background.setThumbnailPath("/assets/backgrounds/thumbnails/" + newThumbnailName);
            } else {
                background.setThumbnailPath(null);
            }

            result.add(background);
        }

        restoreZipFiles(zipFile, fileTargets);
        jdbi.useExtension(BackgroundDAO.class, dao -> {
            for (Background background : result) {
                dao.save(background);
            }
        });

        logger.info("导入背景完成: {} 张", result.size());
        return result;
    }

    // ==================================================================
    // 音频
    // ==================================================================

    /**
     * @function 导出音频为临时 ZIP
     * @param audioIds 要导出的音频 ID；为空表示导出全部
     */
    public Path exportAudios(List<String> audioIds) throws IOException {
        List<Audio> audios = loadAudios(audioIds);
        Path zip = Files.createTempFile("audios_export_", ".zip");

        try (ZipWriter writer = new ZipWriter(zip)) {
            writer.writeBytes(AUDIOS_MANIFEST, createJsonMapper().writeValueAsBytes(audios));

            for (Audio audio : audios) {
                File audioFile = resolveAssetFile(audio.getPath());
                if (audioFile != null) {
                    writer.writeFile(entryFolder(audio.getUuid()) + audioFile.getName(), audioFile);
                }
            }
        } catch (IOException e) {
            deleteQuietly(zip);
            throw e;
        }

        logger.info("导出音频完成: {} 个", audios.size());
        return zip;
    }

    /** @function 从 ZIP 导入音频（单个资源包，清单在根目录） */
    public List<Audio> importAudios(Path zipFile) throws IOException {
        return importAudios(zipFile, "", scanZip(zipFile));
    }

    List<Audio> importAudios(Path zipFile, String entryPrefix, ZipScan scan) throws IOException {
        String audiosJson = scan.manifests.get(entryPrefix + AUDIOS_MANIFEST);
        if (audiosJson == null) {
            throw new IllegalArgumentException("无效的音频导出文件：缺少 " + AUDIOS_MANIFEST);
        }

        ObjectMapper mapper = createJsonMapper();
        List<Audio> importedAudios = mapper.readValue(audiosJson,
                mapper.getTypeFactory().constructCollectionType(List.class, Audio.class));

        Path audiosDir = RuntimePaths.getAudiosDir();
        Files.createDirectories(audiosDir);

        String timestamp = String.valueOf(System.currentTimeMillis());
        List<Audio> result = new ArrayList<>();
        Map<String, Path> fileTargets = new HashMap<>();

        for (int i = 0; i < importedAudios.size(); i++) {
            Audio audio = importedAudios.get(i);
            String oldFolder = entryFolder(audio.getUuid());

            String newUuid = audio.getUuid();
            if (newUuid == null || newUuid.isEmpty() || audioExists(newUuid)) {
                newUuid = "audio_import_" + timestamp + "_" + i;
                logger.info("音频 ID 冲突或缺失，已分配新 ID: {} → {}", audio.getUuid(), newUuid);
            }
            audio.setUuid(newUuid);

            if (audio.getName() == null || audio.getName().trim().isEmpty()) {
                audio.setName("导入的音频_" + (i + 1));
            }
            if (audio.getType() == null || audio.getType().trim().isEmpty()) {
                // 前端与渲染端只认 bgm / sfx，缺字段的历史数据按背景音乐处理
                audio.setType("bgm");
            }

            String oldFileName = fileNameOf(audio.getPath());
            String audioEntry = oldFileName == null ? null : entryPrefix + oldFolder + oldFileName;
            if (audioEntry != null && scan.fileEntries.contains(audioEntry)) {
                String newFileName = stemOf(oldFileName) + "_import_" + timestamp + "_" + i
                        + extensionOf(oldFileName, ".mp3");
                fileTargets.put(audioEntry, audiosDir.resolve(newFileName));
                audio.setPath("/assets/audios/" + newFileName);
            } else {
                logger.warn("ZIP 中未找到音频文件: {}，已清除音频路径", audioEntry);
                audio.setPath(null);
            }

            result.add(audio);
        }

        restoreZipFiles(zipFile, fileTargets);
        for (Audio audio : result) {
            AudioDAO.addAudio(audio);
        }

        logger.info("导入音频完成: {} 个", result.size());
        return result;
    }

    // ==================================================================
    // 全部资源（角色 + 背景 + 音频）
    // ==================================================================

    /**
     * @function 导出全部资源为临时 ZIP
     *
     * <p>结构：{@code characters/}、{@code backgrounds/}、{@code audios/} 三个目录，
     * 各自内部与单类型资源包完全一致；根目录另有一个 {@code manifest.json}。
     */
    public Path exportAll() throws IOException {
        Path charactersZip = null;
        Path backgroundsZip = null;
        Path audiosZip = null;
        Path bundleZip = Files.createTempFile("resources_export_", ".zip");

        try {
            charactersZip = exportCharacters(null);
            backgroundsZip = exportBackgrounds(null);
            audiosZip = exportAudios(null);

            try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(bundleZip))) {
                // 三个子包按前缀拼进同一个包：子包内部结构原样保留，因此导入端可以
                // 直接把前缀交给同一套单类型解析逻辑
                copyZipEntries(charactersZip, zos, CHARACTERS_PREFIX);
                copyZipEntries(backgroundsZip, zos, BACKGROUNDS_PREFIX);
                copyZipEntries(audiosZip, zos, AUDIOS_PREFIX);

                Map<String, Object> manifest = new LinkedHashMap<>();
                manifest.put("formatVersion", BUNDLE_FORMAT_VERSION);
                manifest.put("exportedAt", OffsetDateTime.now().toString());
                manifest.put("application", "LimbusCompanyPlotVideoGenerator");
                zos.putNextEntry(new ZipEntry(BUNDLE_MANIFEST));
                zos.write(createJsonMapper().writeValueAsBytes(manifest));
                zos.closeEntry();
            }
        } catch (IOException e) {
            deleteQuietly(bundleZip);
            throw e;
        } finally {
            deleteQuietly(charactersZip);
            deleteQuietly(backgroundsZip);
            deleteQuietly(audiosZip);
        }

        logger.info("导出全部资源完成");
        return bundleZip;
    }

    /**
     * @function 导入全部资源（也兼容直接上传单一类型的资源包）
     */
    public BundleImportResult importAll(Path zipFile) throws IOException {
        ZipScan scan = scanZip(zipFile);
        validateBundleFormat(scan);

        boolean hasCharacters = scan.manifests.containsKey(CHARACTERS_PREFIX + CHARACTERS_MANIFEST)
                || scan.manifests.containsKey(CHARACTERS_MANIFEST);
        boolean hasBackgrounds = scan.manifests.containsKey(BACKGROUNDS_PREFIX + BACKGROUNDS_MANIFEST)
                || scan.manifests.containsKey(BACKGROUNDS_MANIFEST);
        boolean hasAudios = scan.manifests.containsKey(AUDIOS_PREFIX + AUDIOS_MANIFEST)
                || scan.manifests.containsKey(AUDIOS_MANIFEST);

        if (!hasCharacters && !hasBackgrounds && !hasAudios) {
            throw new IllegalArgumentException(
                    "无效的资源包：需要包含 characters.json / backgrounds.json / audios.json 之一");
        }

        int characters = 0;
        if (hasCharacters) {
            String prefix = scan.manifests.containsKey(CHARACTERS_PREFIX + CHARACTERS_MANIFEST)
                    ? CHARACTERS_PREFIX
                    : "";
            characters = importCharacters(zipFile, prefix, scan).size();
        }

        int backgrounds = 0;
        if (hasBackgrounds) {
            String prefix = scan.manifests.containsKey(BACKGROUNDS_PREFIX + BACKGROUNDS_MANIFEST)
                    ? BACKGROUNDS_PREFIX
                    : "";
            backgrounds = importBackgrounds(zipFile, prefix, scan).size();
        }

        int audios = 0;
        if (hasAudios) {
            String prefix = scan.manifests.containsKey(AUDIOS_PREFIX + AUDIOS_MANIFEST)
                    ? AUDIOS_PREFIX
                    : "";
            audios = importAudios(zipFile, prefix, scan).size();
        }

        logger.info("导入全部资源完成: 角色 {} / 背景 {} / 音频 {}", characters, backgrounds, audios);
        return new BundleImportResult(characters, backgrounds, audios);
    }

    /** 全部资源导入结果（直接序列化给前端展示"导入了几项"） */
    public static class BundleImportResult {
        private final int characters;
        private final int backgrounds;
        private final int audios;

        public BundleImportResult(int characters, int backgrounds, int audios) {
            this.characters = characters;
            this.backgrounds = backgrounds;
            this.audios = audios;
        }

        public int getCharacters() {
            return characters;
        }

        public int getBackgrounds() {
            return backgrounds;
        }

        public int getAudios() {
            return audios;
        }
    }

    // ==================================================================
    // ZIP 读写底层
    // ==================================================================

    /**
     * 导出的 ZIP 写入器：保证同一条目只写一次。
     *
     * <p>ZipOutputStream 遇到重复条目会直接抛 ZipException，而素材里"两张背景指向同一个文件"
     * 这种情况确实可能存在，所以这里统一把重复条目跳过并记日志。
     */
    private static final class ZipWriter implements AutoCloseable {
        private final ZipOutputStream zos;
        private final Set<String> writtenEntries = new HashSet<>();

        ZipWriter(Path zipFile) throws IOException {
            Files.createDirectories(zipFile.toAbsolutePath().getParent());
            this.zos = new ZipOutputStream(Files.newOutputStream(zipFile));
        }

        void writeBytes(String entryName, byte[] data) throws IOException {
            if (!beginEntry(entryName)) {
                return;
            }
            zos.write(data);
            zos.closeEntry();
        }

        void writeFile(String entryName, File file) throws IOException {
            if (file == null || !file.isFile()) {
                logger.warn("导出时跳过不存在的文件: {}",
                        file == null ? "(空路径)" : file.getAbsolutePath());
                return;
            }
            if (!beginEntry(entryName)) {
                return;
            }
            // 边读边写，避免把大文件整体读进内存
            try (InputStream in = Files.newInputStream(file.toPath())) {
                copy(in, zos);
            }
            zos.closeEntry();
        }

        private boolean beginEntry(String entryName) throws IOException {
            if (!writtenEntries.add(entryName)) {
                logger.warn("导出时跳过重复条目: {}", entryName);
                return false;
            }
            zos.putNextEntry(new ZipEntry(entryName));
            return true;
        }

        @Override
        public void close() throws IOException {
            zos.close();
        }
    }

    /** ZIP 扫描结果：所有文件条目名（完整路径）+ 各清单文件内容 */
    static final class ZipScan {
        /** ZIP 内的完整条目名（已统一成正斜杠） */
        final Set<String> fileEntries = new LinkedHashSet<>();
        /** 清单文件名 → 内容（只读入清单，其余条目不读，避免占内存） */
        final Map<String, String> manifests = new HashMap<>();
    }

    /**
     * @function 扫描 ZIP：收集条目名，并把清单文件读进内存
     */
    static ZipScan scanZip(Path zipFile) throws IOException {
        if (!Files.isRegularFile(zipFile)) {
            throw new IllegalArgumentException("资源包文件不存在");
        }
        ZipScan scan = new ZipScan();
        try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = normalizeEntryName(entry.getName());
                if (name.isEmpty()) {
                    continue;
                }
                scan.fileEntries.add(name);
                if (MANIFEST_FILE_NAMES.contains(fileNameOf(name))) {
                    scan.manifests.put(name, new String(zis.readAllBytes(), StandardCharsets.UTF_8));
                }
            }
        }
        return scan;
    }

    /**
     * @function 把 ZIP 中命中的文件流式写到目标路径
     * @param fileTargets ZIP 内完整条目名 → 磁盘目标路径
     * @return 实际写出的文件数
     */
    private static int restoreZipFiles(Path zipFile, Map<String, Path> fileTargets) throws IOException {
        if (fileTargets.isEmpty()) {
            return 0;
        }
        int restored = 0;
        try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                Path target = fileTargets.get(normalizeEntryName(entry.getName()));
                if (target == null) {
                    continue;
                }
                Files.createDirectories(target.toAbsolutePath().getParent());
                Files.copy(zis, target, StandardCopyOption.REPLACE_EXISTING);
                restored++;
            }
        }
        return restored;
    }

    /** 把子 ZIP 的条目按前缀复制进目标 ZIP（用于"全部资源"打包） */
    private static void copyZipEntries(Path subZip, ZipOutputStream zos, String entryPrefix)
            throws IOException {
        try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(subZip))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = normalizeEntryName(entry.getName());
                if (name.isEmpty()) {
                    continue;
                }
                zos.putNextEntry(new ZipEntry(entryPrefix + name));
                copy(zis, zos);
                zos.closeEntry();
            }
        }
    }

    /** 校验资源包格式版本，拒绝"比当前程序更新"的包 */
    private void validateBundleFormat(ZipScan scan) throws IOException {
        String manifestJson = scan.manifests.get(BUNDLE_MANIFEST);
        if (manifestJson == null) {
            // 没有清单 = 单类型资源包或旧包，靠清单文件名判断类型即可
            return;
        }
        JsonNode manifest = createJsonMapper().readTree(manifestJson);
        int version = manifest.path("formatVersion").asInt(BUNDLE_FORMAT_VERSION);
        if (version > BUNDLE_FORMAT_VERSION) {
            throw new IllegalArgumentException("资源包格式版本（" + version + "）高于当前程序支持的版本（"
                    + BUNDLE_FORMAT_VERSION + "），请先升级程序后再导入");
        }
    }

    // ==================================================================
    // 数据加载
    // ==================================================================

    private List<MyCharacter> loadCharacters(List<String> characterIds) {
        List<MyCharacter> characters = jdbi.withHandle(handle -> {
            handle.registerRowMapper(new CharacterMapper(jdbi));
            CharacterDAO dao = handle.attach(CharacterDAO.class);
            List<MyCharacter> loaded = new ArrayList<>();
            if (characterIds == null || characterIds.isEmpty()) {
                loaded.addAll(dao.findAll());
            } else {
                for (String id : characterIds) {
                    dao.findById(id).ifPresent(loaded::add);
                }
            }
            return loaded;
        });
        logger.info("待导出角色数量: {}", characters.size());
        return characters;
    }

    private List<Background> loadBackgrounds(List<String> backgroundIds) {
        return jdbi.withExtension(BackgroundDAO.class, dao -> {
            List<Background> loaded = new ArrayList<>();
            if (backgroundIds == null || backgroundIds.isEmpty()) {
                loaded.addAll(dao.findAll());
            } else {
                for (String id : backgroundIds) {
                    dao.findById(id).ifPresent(loaded::add);
                }
            }
            return loaded;
        });
    }

    private List<Audio> loadAudios(List<String> audioIds) {
        if (audioIds == null || audioIds.isEmpty()) {
            return AudioDAO.getAllAudios();
        }
        List<Audio> loaded = new ArrayList<>();
        for (String id : audioIds) {
            Audio audio = AudioDAO.getById(id);
            if (audio != null) {
                loaded.add(audio);
            }
        }
        return loaded;
    }

    private boolean characterExists(String characterId) {
        if (characterId == null || characterId.isEmpty()) {
            return false;
        }
        return jdbi.withHandle(handle -> handle.attach(CharacterDAO.class)
                .findById(characterId).isPresent());
    }

    private boolean portraitExists(String portraitId) {
        if (portraitId == null || portraitId.isEmpty()) {
            return false;
        }
        return jdbi.withExtension(PortraitDAO.class, dao -> dao.findById(portraitId).isPresent());
    }

    private boolean backgroundExists(String backgroundId) {
        if (backgroundId == null || backgroundId.isEmpty()) {
            return false;
        }
        return jdbi.withExtension(BackgroundDAO.class,
                dao -> dao.findById(backgroundId).isPresent());
    }

    private boolean audioExists(String audioId) {
        if (audioId == null || audioId.isEmpty()) {
            return false;
        }
        return AudioDAO.getById(audioId) != null;
    }

    // ==================================================================
    // 路径与文件名工具
    // ==================================================================

    /**
     * @function 把数据库里的素材路径解析成本地文件
     *
     * <p>历史数据里同一个字段混用过多种写法：{@code /assets/backgrounds/x.png}（URL）、
     * {@code assets/backgrounds/x.png}、{@code ./assets/...}、Windows 绝对路径、裸文件名。
     * 这里统一收敛：先去掉 {@code assets/} 前缀，绝对路径直接用，相对路径相对素材根目录解析。
     *
     * @return 最佳候选文件（可能不存在，由调用方判断）；路径为空时返回 null
     */
    private File resolveAssetFile(String dbPath) {
        if (dbPath == null || dbPath.trim().isEmpty()) {
            return null;
        }
        String normalized = dbPath.trim().replace('\\', '/');
        if (normalized.startsWith("/assets/")) {
            normalized = normalized.substring("/assets/".length());
        } else if (normalized.startsWith("assets/")) {
            normalized = normalized.substring("assets/".length());
        } else if (normalized.startsWith("./assets/")) {
            normalized = normalized.substring("./assets/".length());
        }

        File direct = new File(normalized);
        if (direct.isAbsolute()) {
            return direct;
        }
        File inAssets = new File(RuntimePaths.getAssetsDir().toFile(), normalized);
        if (inAssets.isFile()) {
            return inAssets;
        }
        // 兼容以 JVM 工作目录（安装版即数据根目录）为基准的历史路径
        File inWorkingDir = new File(normalized);
        return inWorkingDir.isFile() ? inWorkingDir : inAssets;
    }

    /** ZIP 条目名统一成正斜杠、去掉多余的 ./ 与前导 / */
    private static String normalizeEntryName(String rawName) {
        String name = rawName.replace('\\', '/');
        while (name.startsWith("./")) {
            name = name.substring(2);
        }
        while (name.startsWith("/")) {
            name = name.substring(1);
        }
        return name;
    }

    /** 取路径里的文件名（兼容 / 与 \），取不到返回 null */
    private static String fileNameOf(String path) {
        if (path == null) {
            return null;
        }
        String normalized = path.replace('\\', '/');
        int slashIndex = normalized.lastIndexOf('/');
        String name = slashIndex >= 0 ? normalized.substring(slashIndex + 1) : normalized;
        return name.isEmpty() ? null : name;
    }

    /** 取扩展名（含点号），取不到用 fallback */
    private static String extensionOf(String fileName, String fallback) {
        if (fileName == null) {
            return fallback;
        }
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex == fileName.length() - 1) {
            return fallback;
        }
        return fileName.substring(dotIndex);
    }

    /** 取文件名主干并清掉 Windows 非法字符（用于生成导入后的文件名） */
    private static String stemOf(String fileName) {
        if (fileName == null) {
            return "imported";
        }
        int dotIndex = fileName.lastIndexOf('.');
        String stem = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
        String cleaned = stem.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (cleaned.isEmpty()) {
            return "imported";
        }
        // 目录名 + 文件名 + 时间戳，控制在 Windows 路径长度限制内
        return cleaned.length() > 60 ? cleaned.substring(0, 60) : cleaned;
    }

    /** 每类资源在包内都以 ID 作为目录名 */
    private static String entryFolder(String id) {
        if (id == null || id.isEmpty()) {
            return "unknown/";
        }
        return id.replaceAll("[\\\\/:*?\"<>|]", "_") + "/";
    }

    /** 拼 ZIP 内条目名；任一段缺失时返回 null（表示该文件本来就导出不了） */
    private static String joinEntry(String prefix, String folder, String fileName) {
        if (folder == null || folder.isEmpty() || fileName == null || fileName.isEmpty()) {
            return null;
        }
        return prefix + folder + "/" + fileName;
    }

    /** 导出/导入都用同一套 JSON 配置，保证颜色字段等序列化格式一致 */
    private static ObjectMapper createJsonMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.enable(SerializationFeature.INDENT_OUTPUT);
        return mapper;
    }

    /** 流式复制；不关闭任何流（由调用方管理生命周期） */
    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
    }
}

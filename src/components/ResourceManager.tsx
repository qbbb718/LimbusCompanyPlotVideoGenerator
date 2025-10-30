import React, { useState, useEffect } from 'react';
import { Tabs, Tab, Box, Typography, Button, TextField, Grid, Card, CardMedia, CardContent, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, ListItemSecondaryAction, Chip, InputAdornment, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { Add, Delete, Search, FolderOpen, Edit, DragIndicator } from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import axios from 'axios';

// 类型定义
interface Resource {
  id: string;
  name: string;
  fileName: string;
  tags: string[];
  path: string;
}

interface Character {
  id: string;
  name: string;
  avatar: string;
  height: number;
  nameColor: string;
  backgroundColor: string;
  illustrations: Illustration[];
}

interface Illustration {
  id: string;
  name?: string;
  emotion?: string;
  fileName: string;
  path: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
}

// 资源文件夹路径
const RESOURCE_PATHS = {
  characters: '\\demo\\src\\main\\resources\\assets\\characters',
  backgrounds: '\\demo\\src\\main\\resources\\assets\\backgrounds',
  audio: '\\demo\\src\\main\\resources\\assets\\audio'
};

// 默认裁剪参数
const DEFAULT_CROP_PARAMS = {
  cropX: 0,
  cropY: 0,
  cropWidth: 100,
  cropHeight: 100
};

const ResourceManager: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // 背景和音效数据
  const [backgrounds, setBackgrounds] = useState<Resource[]>([]);
  const [audioFiles, setAudioFiles] = useState<Resource[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // 角色数据
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isCharacterEditDialogOpen, setIsCharacterEditDialogOpen] = useState(false);
  const [isIllustrationDialogOpen, setIsIllustrationDialogOpen] = useState(false);
  const [selectedIllustration, setSelectedIllustration] = useState<Illustration | null>(null);
  const [newIllustrationFile, setNewIllustrationFile] = useState<File | null>(null);

  // 加载数据
  useEffect(() => {
    loadBackgrounds();
    loadAudioFiles();
    loadCharacters();
  }, []);

  // 加载背景资源
  const loadBackgrounds = async () => {
    try {
      // 实际实现中应该调用后端API
      // const response = await axios.get('/api/resources/backgrounds');
      // setBackgrounds(response.data);

      // 模拟数据
      setBackgrounds([
        { id: '1', name: '城市街道', fileName: 'city_street.jpg', tags: ['城市', '白天'], path: RESOURCE_PATHS.backgrounds + '\\city_street.jpg' },
        { id: '2', name: '办公室', fileName: 'office.jpg', tags: ['室内', '白天'], path: RESOURCE_PATHS.backgrounds + '\\office.jpg' },
        { id: '3', name: '夜晚小巷', fileName: 'night_alley.jpg', tags: ['城市', '夜晚'], path: RESOURCE_PATHS.backgrounds + '\\night_alley.jpg' }
      ]);

      // 提取所有标签
      const tags = new Set<string>();
      // 这里应该从实际数据中提取标签
      setAvailableTags(Array.from(tags));
    } catch (error) {
      console.error('加载背景资源失败:', error);
    }
  };

  // 加载音效资源
  const loadAudioFiles = async () => {
    try {
      // 实际实现中应该调用后端API
      // const response = await axios.get('/api/resources/audio');
      // setAudioFiles(response.data);

      // 模拟数据
      setAudioFiles([
        { id: '1', name: '脚步声', fileName: 'footsteps.mp3', tags: ['动作'], path: RESOURCE_PATHS.audio + '\\footsteps.mp3' },
        { id: '2', name: '开门声', fileName: 'door_open.mp3', tags: ['动作'], path: RESOURCE_PATHS.audio + '\\door_open.mp3' },
        { id: '3', name: '背景音乐', fileName: 'bgm.mp3', tags: ['音乐'], path: RESOURCE_PATHS.audio + '\\bgm.mp3' }
      ]);
    } catch (error) {
      console.error('加载音效资源失败:', error);
    }
  };

  // 加载角色数据
  const loadCharacters = async () => {
    try {
      // 实际实现中应该调用后端API
      // const response = await axios.get('/api/resources/characters');
      // setCharacters(response.data);

      // 模拟数据
      setCharacters([
        {
          id: '1',
          name: '格里高尔',
          avatar: 'gregor_avatar.jpg',
          height: 175,
          nameColor: '#FFFFFF',
          backgroundColor: '#1E88E5',
          illustrations: [
            { id: '1-1', name: '微笑', emotion: 'happy', fileName: 'gregor_happy.jpg', path: RESOURCE_PATHS.characters + '\\gregor_happy.jpg', ...DEFAULT_CROP_PARAMS },
            { id: '1-2', emotion: 'angry', fileName: 'gregor_angry.jpg', path: RESOURCE_PATHS.characters + '\\gregor_angry.jpg', ...DEFAULT_CROP_PARAMS }
          ]
        },
        {
          id: '2',
          name: '浮士德',
          avatar: 'faust_avatar.jpg',
          height: 165,
          nameColor: '#FFFFFF',
          backgroundColor: '#8E24AA',
          illustrations: [
            { id: '2-1', emotion: 'neutral', fileName: 'faust_neutral.jpg', path: RESOURCE_PATHS.characters + '\\faust_neutral.jpg', ...DEFAULT_CROP_PARAMS }
          ]
        }
      ]);
    } catch (error) {
      console.error('加载角色数据失败:', error);
    }
  };

  // 处理标签页切换
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // 打开资源文件夹
  const openResourceFolder = (resourceType: 'characters' | 'backgrounds' | 'audio') => {
    // 实际实现中应该调用后端API打开文件夹
    // axios.post('/api/resources/open-folder', { resourceType });
    console.log(`打开${resourceType}文件夹: ${RESOURCE_PATHS[resourceType]}`);
  };

  // 处理背景拖拽排序
  const handleBackgroundDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(backgrounds);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setBackgrounds(items);

    // 实际实现中应该调用后端API保存新顺序
    // axios.post('/api/resources/backgrounds/reorder', { newOrder: items });
  };

  // 处理音效拖拽排序
  const handleAudioDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(audioFiles);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setAudioFiles(items);

    // 实际实现中应该调用后端API保存新顺序
    // axios.post('/api/resources/audio/reorder', { newOrder: items });
  };

  // 处理角色立绘拖拽排序
  const handleIllustrationDragEnd = (result: any) => {
    if (!result.destination || !selectedCharacter) return;

    const items = Array.from(selectedCharacter.illustrations);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedCharacter = {
      ...selectedCharacter,
      illustrations: items
    };

    setSelectedCharacter(updatedCharacter);
    setCharacters(characters.map(char => 
      char.id === selectedCharacter.id ? updatedCharacter : char
    ));

    // 实际实现中应该调用后端API保存新顺序
    // axios.post('/api/resources/characters/illustrations/reorder', { 
    //   characterId: selectedCharacter.id, 
    //   newOrder: items 
    // });
  };

  // 处理背景文件选择
  const handleBackgroundFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const file = e.target.files[0];
    const fileName = file.name;
    const name = fileName.split('.')[0]; // 使用文件名作为默认名称
    const path = `${RESOURCE_PATHS.backgrounds}\\${fileName}`;
    
    // 创建新背景对象
    const newBackground: Resource = {
      id: Date.now().toString(),
      name,
      fileName,
      tags: [],
      path
    };
    
    // 添加到背景列表
    setBackgrounds([...backgrounds, newBackground]);
    
    // 实际实现中应该上传文件并调用后端API
    // const formData = new FormData();
    // formData.append('file', file);
    // try {
    //   const response = await axios.post('/api/resources/backgrounds', formData);
    //   setBackgrounds([...backgrounds, response.data]);
    // } catch (error) {
    //   console.error('上传背景失败:', error);
    // }
  };
  
  // 添加新背景
  const addBackground = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = handleBackgroundFileSelect;
    fileInput.click();
  };

  // 处理音效文件选择
  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const file = e.target.files[0];
    const fileName = file.name;
    const name = fileName.split('.')[0]; // 使用文件名作为默认名称
    const path = `${RESOURCE_PATHS.audio}\\${fileName}`;
    
    // 创建新音效对象
    const newAudio: Resource = {
      id: Date.now().toString(),
      name,
      fileName,
      tags: [],
      path
    };
    
    // 添加到音效列表
    setAudioFiles([...audioFiles, newAudio]);
    
    // 实际实现中应该上传文件并调用后端API
    // const formData = new FormData();
    // formData.append('file', file);
    // try {
    //   const response = await axios.post('/api/resources/audio', formData);
    //   setAudioFiles([...audioFiles, response.data]);
    // } catch (error) {
    //   console.error('上传音效失败:', error);
    // }
  };
  
  // 添加新音效
  const addAudio = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.onchange = handleAudioFileSelect;
    fileInput.click();
  };

  // 添加新角色对话框状态
  const [isAddCharacterDialogOpen, setIsAddCharacterDialogOpen] = useState(false);
  const [newCharacter, setNewCharacter] = useState<Partial<Character>>({
    name: '',
    height: 170,
    nameColor: '#FFFFFF',
    backgroundColor: '#1E88E5',
    illustrations: []
  });
  
  // 打开添加角色对话框
  const openAddCharacterDialog = () => {
    setNewCharacter({
      name: '',
      height: 170,
      nameColor: '#FFFFFF',
      backgroundColor: '#1E88E5',
      illustrations: []
    });
    setIsAddCharacterDialogOpen(true);
  };
  
  // 关闭添加角色对话框
  const closeAddCharacterDialog = () => {
    setIsAddCharacterDialogOpen(false);
  };
  
  // 保存新角色
  const saveNewCharacter = () => {
    if (!newCharacter.name) {
      alert('请输入角色名');
      return;
    }
    
    const character: Character = {
      id: Date.now().toString(),
      name: newCharacter.name,
      avatar: 'default_avatar.jpg', // 默认头像
      height: newCharacter.height || 170,
      nameColor: newCharacter.nameColor || '#FFFFFF',
      backgroundColor: newCharacter.backgroundColor || '#1E88E5',
      illustrations: newCharacter.illustrations || []
    };
    
    // 添加到角色列表
    setCharacters([...characters, character]);
    
    // 实际实现中应该调用后端API保存
    // try {
    //   const response = await axios.post('/api/resources/characters', character);
    //   setCharacters([...characters, response.data]);
    // } catch (error) {
    //   console.error('创建角色失败:', error);
    // }
    
    closeAddCharacterDialog();
  };
  
  // 添加新角色
  const addCharacter = () => {
    openAddCharacterDialog();
  };

  // 删除背景
  const deleteBackground = (id: string) => {
    setBackgrounds(backgrounds.filter(bg => bg.id !== id));
    // 实际实现中应该调用后端API删除
    // axios.delete(`/api/resources/backgrounds/${id}`);
  };

  // 删除音效
  const deleteAudio = (id: string) => {
    setAudioFiles(audioFiles.filter(audio => audio.id !== id));
    // 实际实现中应该调用后端API删除
    // axios.delete(`/api/resources/audio/${id}`);
  };

  // 删除角色
  const deleteCharacter = (id: string) => {
    setCharacters(characters.filter(char => char.id !== id));
    // 实际实现中应该调用后端API删除
    // axios.delete(`/api/resources/characters/${id}`);
  };

  // 打开角色编辑对话框
  const openCharacterEditDialog = (character: Character) => {
    setSelectedCharacter(character);
    setIsCharacterEditDialogOpen(true);
  };

  // 关闭角色编辑对话框
  const closeCharacterEditDialog = () => {
    setIsCharacterEditDialogOpen(false);
    setSelectedCharacter(null);
  };

  // 保存角色编辑
  const saveCharacterEdit = () => {
    if (!selectedCharacter) return;

    setCharacters(characters.map(char => 
      char.id === selectedCharacter.id ? selectedCharacter : char
    ));

    // 实际实现中应该调用后端API保存
    // axios.put(`/api/resources/characters/${selectedCharacter.id}`, selectedCharacter);

    closeCharacterEditDialog();
  };

  // 打开立绘编辑对话框
  const openIllustrationDialog = (illustration?: Illustration) => {
    setSelectedIllustration(illustration || null);
    setIsIllustrationDialogOpen(true);
  };

  // 关闭立绘编辑对话框
  const closeIllustrationDialog = () => {
    setIsIllustrationDialogOpen(false);
    setSelectedIllustration(null);
    setNewIllustrationFile(null);
  };

  // 保存立绘编辑
  const saveIllustrationEdit = () => {
    if (!selectedCharacter) return;

    let updatedIllustrations = [...selectedCharacter.illustrations];

    if (newIllustrationFile) {
      // 添加新立绘
      const newIllustration: Illustration = {
        id: Date.now().toString(),
        fileName: newIllustrationFile.name,
        path: `${RESOURCE_PATHS.characters}\\${newIllustrationFile.name}`,
        ...DEFAULT_CROP_PARAMS
      };
      updatedIllustrations.push(newIllustration);

      // 实际实现中应该上传文件
      // const formData = new FormData();
      // formData.append('file', newIllustrationFile);
      // formData.append('characterId', selectedCharacter.id);
      // axios.post('/api/resources/characters/illustrations', formData);
    } else if (selectedIllustration) {
      // 更新现有立绘
      updatedIllustrations = updatedIllustrations.map(ill => 
        ill.id === selectedIllustration.id ? selectedIllustration : ill
      );

      // 实际实现中应该调用后端API保存
      // axios.put(`/api/resources/characters/illustrations/${selectedIllustration.id}`, selectedIllustration);
    }

    const updatedCharacter = {
      ...selectedCharacter,
      illustrations: updatedIllustrations
    };

    setSelectedCharacter(updatedCharacter);
    setCharacters(characters.map(char => 
      char.id === selectedCharacter.id ? updatedCharacter : char
    ));

    closeIllustrationDialog();
  };

  // 删除立绘
  const deleteIllustration = (illustrationId: string) => {
    if (!selectedCharacter) return;

    const updatedIllustrations = selectedCharacter.illustrations.filter(ill => ill.id !== illustrationId);
    const updatedCharacter = {
      ...selectedCharacter,
      illustrations: updatedIllustrations
    };

    setSelectedCharacter(updatedCharacter);
    setCharacters(characters.map(char => 
      char.id === selectedCharacter.id ? updatedCharacter : char
    ));

    // 实际实现中应该调用后端API删除
    // axios.delete(`/api/resources/characters/illustrations/${illustrationId}`);
  };

  // 筛选背景
  const filteredBackgrounds = backgrounds.filter(bg => {
    const matchesSearch = bg.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         bg.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = !tagFilter || bg.tags.includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  // 筛选音效
  const filteredAudioFiles = audioFiles.filter(audio => {
    const matchesSearch = audio.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         audio.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = !tagFilter || audio.tags.includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  // 筛选角色
  const filteredCharacters = characters.filter(char => 
    char.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      <Typography variant="h4" gutterBottom>
        资源管理
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="背景" />
          <Tab label="音效" />
          <Tab label="角色" />
        </Tabs>
      </Box>

      {/* 搜索和筛选栏 */}
      <Box sx={{ display: 'flex', mb: 2, gap: 2 }}>
        <TextField
          placeholder="搜索..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          sx={{ flexGrow: 1 }}
        />

        {(tabValue === 0 || tabValue === 1) && (
          <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="tag-filter-label">标签筛选</InputLabel>
            <Select
              labelId="tag-filter-label"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              label="标签筛选"
            >
              <MenuItem value="">
                <em>全部</em>
              </MenuItem>
              {availableTags.map(tag => (
                <MenuItem key={tag} value={tag}>{tag}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Button
          variant="outlined"
          startIcon={<FolderOpen />}
          onClick={() => {
            if (tabValue === 0) openResourceFolder('backgrounds');
            else if (tabValue === 1) openResourceFolder('audio');
            else openResourceFolder('characters');
          }}
        >
          打开资源文件夹
        </Button>
      </Box>

      {/* 背景标签页 */}
      {tabValue === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={addBackground}
            >
              添加背景
            </Button>
          </Box>

          <DragDropContext onDragEnd={handleBackgroundDragEnd}>
            <Droppable droppableId="backgrounds">
              {(provided) => (
                <Grid container spacing={2} {...provided.droppableProps} ref={provided.innerRef}>
                  {filteredBackgrounds.map((bg, index) => (
                    <Draggable key={bg.id} draggableId={bg.id} index={index}>
                      {(provided, snapshot) => (
                        <Grid
                          item
                          xs={12} sm={6} md={4} lg={3}
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          sx={{ opacity: snapshot.isDragging ? 0.5 : 1 }}
                        >
                          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
                              <IconButton {...provided.dragHandleProps} size="small">
                                <DragIndicator />
                              </IconButton>
                              <IconButton size="small" onClick={() => deleteBackground(bg.id)}>
                                <Delete />
                              </IconButton>
                            </Box>
                            <CardMedia
                              component="img"
                              height="140"
                              image={bg.path}
                              alt={bg.name}
                            />
                            <CardContent sx={{ flexGrow: 1 }}>
                              <Typography variant="h6" component="div">
                                {bg.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {bg.fileName}
                              </Typography>
                              <Box sx={{ mt: 1 }}>
                                {bg.tags.map(tag => (
                                  <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                                ))}
                              </Box>
                            </CardContent>
                          </Card>
                        </Grid>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </Grid>
              )}
            </Droppable>
          </DragDropContext>
        </Box>
      )}

      {/* 音效标签页 */}
      {tabValue === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={addAudio}
            >
              添加音效
            </Button>
          </Box>

          <DragDropContext onDragEnd={handleAudioDragEnd}>
            <Droppable droppableId="audio">
              {(provided) => (
                <List {...provided.droppableProps} ref={provided.innerRef}>
                  {filteredAudioFiles.map((audio, index) => (
                    <Draggable key={audio.id} draggableId={audio.id} index={index}>
                      {(provided, snapshot) => (
                        <ListItem
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          sx={{ 
                            opacity: snapshot.isDragging ? 0.5 : 1,
                            mb: 1,
                            border: '1px solid #e0e0e0',
                            borderRadius: 1
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <IconButton {...provided.dragHandleProps}>
                              <DragIndicator />
                            </IconButton>
                            <ListItemText
                              primary={audio.name}
                              secondary={audio.fileName}
                            />
                            <Box sx={{ flexGrow: 1 }} />
                            <Box sx={{ mr: 2 }}>
                              {audio.tags.map(tag => (
                                <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5 }} />
                              ))}
                            </Box>
                            <IconButton onClick={() => deleteAudio(audio.id)}>
                              <Delete />
                            </IconButton>
                          </Box>
                        </ListItem>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </List>
              )}
            </Droppable>
          </DragDropContext>
        </Box>
      )}

      {/* 角色标签页 */}
      {tabValue === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={addCharacter}
            >
              添加角色
            </Button>
          </Box>

          <Grid container spacing={2}>
            {filteredCharacters.map(character => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={character.id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
                    <IconButton size="small" onClick={() => deleteCharacter(character.id)}>
                      <Delete />
                    </IconButton>
                  </Box>
                  <CardMedia
                    component="img"
                    height="140"
                    image={`${RESOURCE_PATHS.characters}\\${character.avatar}`}
                    alt={character.name}
                  />
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" component="div">
                      {character.name}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Edit />}
                        onClick={() => openCharacterEditDialog(character)}
                        sx={{ mr: 1 }}
                      >
                        编辑角色
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => openCharacterEditDialog(character)}
                      >
                        管理立绘
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* 角色编辑对话框 */}
          <Dialog
            open={isCharacterEditDialogOpen}
            onClose={closeCharacterEditDialog}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>编辑角色</DialogTitle>
            <DialogContent>
              {selectedCharacter && (
                <Box sx={{ mt: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="角色名"
                        fullWidth
                        value={selectedCharacter.name}
                        onChange={(e) => setSelectedCharacter({
                          ...selectedCharacter,
                          name: e.target.value
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="身高(cm)"
                        type="number"
                        fullWidth
                        value={selectedCharacter.height}
                        onChange={(e) => setSelectedCharacter({
                          ...selectedCharacter,
                          height: parseInt(e.target.value)
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="名片文字颜色"
                        type="color"
                        fullWidth
                        value={selectedCharacter.nameColor}
                        onChange={(e) => setSelectedCharacter({
                          ...selectedCharacter,
                          nameColor: e.target.value
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="名片背景颜色"
                        type="color"
                        fullWidth
                        value={selectedCharacter.backgroundColor}
                        onChange={(e) => setSelectedCharacter({
                          ...selectedCharacter,
                          backgroundColor: e.target.value
                        })}
                      />
                    </Grid>
                  </Grid>

                  <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
                    立绘列表
                  </Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      onClick={() => openIllustrationDialog()}
                    >
                      添加立绘
                    </Button>
                  </Box>

                  <DragDropContext onDragEnd={handleIllustrationDragEnd}>
                    <Droppable droppableId="illustrations">
                      {(provided) => (
                        <Grid container spacing={2} {...provided.droppableProps} ref={provided.innerRef}>
                          {selectedCharacter.illustrations.map((ill, index) => (
                            <Draggable key={ill.id} draggableId={ill.id} index={index}>
                              {(provided, snapshot) => (
                                <Grid
                                  item
                                  xs={12} sm={6} md={4}
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  sx={{ opacity: snapshot.isDragging ? 0.5 : 1 }}
                                >
                                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
                                      <IconButton {...provided.dragHandleProps} size="small">
                                        <DragIndicator />
                                      </IconButton>
                                      <IconButton size="small" onClick={() => deleteIllustration(ill.id)}>
                                        <Delete />
                                      </IconButton>
                                    </Box>
                                    <CardMedia
                                      component="img"
                                      height="140"
                                      image={ill.path}
                                      alt={ill.name || ill.emotion || ill.fileName}
                                      sx={{
                                        objectPosition: `${ill.cropX || 0}% ${ill.cropY || 0}%`,
                                        objectFit: 'cover'
                                      }}
                                    />
                                    <CardContent sx={{ flexGrow: 1 }}>
                                      <Typography variant="h6" component="div">
                                        {ill.name || ill.emotion || ill.fileName}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        {ill.fileName}
                                      </Typography>
                                      <Box sx={{ mt: 1 }}>
                                        <Button
                                          variant="outlined"
                                          size="small"
                                          onClick={() => openIllustrationDialog(ill)}
                                        >
                                          编辑
                                        </Button>
                                      </Box>
                                    </CardContent>
                                  </Card>
                                </Grid>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </Grid>
                      )}
                    </Droppable>
                  </DragDropContext>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeCharacterEditDialog}>取消</Button>
              <Button onClick={saveCharacterEdit} variant="contained">保存</Button>
            </DialogActions>
          </Dialog>

          {/* 立绘编辑对话框 */}
          <Dialog
            open={isIllustrationDialogOpen}
            onClose={closeIllustrationDialog}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>{selectedIllustration ? '编辑立绘' : '添加立绘'}</DialogTitle>
            <DialogContent>
              <Box sx={{ mt: 2 }}>
                {!selectedIllustration && (
                  <Box sx={{ mb: 2 }}>
                    <Button
                      variant="contained"
                      component="label"
                    >
                      选择立绘文件
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => setNewIllustrationFile(e.target.files?.[0] || null)}
                      />
                    </Button>
                    {newIllustrationFile && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        已选择: {newIllustrationFile.name}
                      </Typography>
                    )}
                  </Box>
                )}

                {(selectedIllustration || newIllustrationFile) && (
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="立绘名称"
                        fullWidth
                        value={selectedIllustration?.name || ''}
                        onChange={(e) => setSelectedIllustration({
                          ...selectedIllustration,
                          name: e.target.value
                        } as Illustration)}
                        helperText="若未设置名称，将显示情绪或文件名"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="情绪"
                        fullWidth
                        value={selectedIllustration?.emotion || ''}
                        onChange={(e) => setSelectedIllustration({
                          ...selectedIllustration,
                          emotion: e.target.value
                        } as Illustration)}
                        helperText="若未设置名称，将显示情绪"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="裁剪位置 X (%)"
                        type="number"
                        fullWidth
                        value={selectedIllustration?.cropX || 0}
                        onChange={(e) => setSelectedIllustration({
                          ...selectedIllustration,
                          cropX: parseInt(e.target.value)
                        } as Illustration)}
                        helperText="控制立绘在水平方向上的显示位置"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="裁剪位置 Y (%)"
                        type="number"
                        fullWidth
                        value={selectedIllustration?.cropY || 0}
                        onChange={(e) => setSelectedIllustration({
                          ...selectedIllustration,
                          cropY: parseInt(e.target.value)
                        } as Illustration)}
                        helperText="控制立绘在垂直方向上的显示位置"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="裁剪宽度 (%)"
                        type="number"
                        fullWidth
                        value={selectedIllustration?.cropWidth || 100}
                        onChange={(e) => setSelectedIllustration({
                          ...selectedIllustration,
                          cropWidth: parseInt(e.target.value)
                        } as Illustration)}
                        helperText="控制立绘显示的宽度比例"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="裁剪高度 (%)"
                        type="number"
                        fullWidth
                        value={selectedIllustration?.cropHeight || 100}
                        onChange={(e) => setSelectedIllustration({
                          ...selectedIllustration,
                          cropHeight: parseInt(e.target.value)
                        } as Illustration)}
                        helperText="控制立绘显示的高度比例"
                      />
                    </Grid>
                  </Grid>
                )}

                <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                  注意：裁剪位置与尺寸涉及立绘显示位置与比例的计算，在载入时会先读取默认立绘设置的裁剪参数，若用户没有修改，则默认使用默认值，若用户修改了，则使用用户设置的值。
                </Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeIllustrationDialog}>取消</Button>
              <Button 
                onClick={saveIllustrationEdit} 
                variant="contained"
                disabled={!selectedIllustration && !newIllustrationFile}
              >
                保存
              </Button>
            </DialogActions>
          </Dialog>

          {/* 添加角色对话框 */}
          <Dialog
            open={isAddCharacterDialogOpen}
            onClose={closeAddCharacterDialog}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>添加新角色</DialogTitle>
            <DialogContent>
              <Box sx={{ mt: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="角色名"
                      fullWidth
                      required
                      value={newCharacter.name || ''}
                      onChange={(e) => setNewCharacter({
                        ...newCharacter,
                        name: e.target.value
                      })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="身高(cm)"
                      type="number"
                      fullWidth
                      value={newCharacter.height || 170}
                      onChange={(e) => setNewCharacter({
                        ...newCharacter,
                        height: parseInt(e.target.value)
                      })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="名片文字颜色"
                      type="color"
                      fullWidth
                      value={newCharacter.nameColor || '#FFFFFF'}
                      onChange={(e) => setNewCharacter({
                        ...newCharacter,
                        nameColor: e.target.value
                      })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="名片背景颜色"
                      type="color"
                      fullWidth
                      value={newCharacter.backgroundColor || '#1E88E5'}
                      onChange={(e) => setNewCharacter({
                        ...newCharacter,
                        backgroundColor: e.target.value
                      })}
                    />
                  </Grid>
                </Grid>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeAddCharacterDialog}>取消</Button>
              <Button onClick={saveNewCharacter} variant="contained">添加</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </Box>
  );
};

export default ResourceManager;

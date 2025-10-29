import React from 'react';
import RecordEditorComponent from './RecordEditor/RecordEditor';
import { Record, ProjectSettings } from '../types';

interface RecordEditorProps {
  projectSettings: ProjectSettings;
}

const RecordEditor: React.FC<RecordEditorProps> = ({ projectSettings }) => {
  return <RecordEditorComponent projectSettings={projectSettings} />;
};

export default RecordEditor;

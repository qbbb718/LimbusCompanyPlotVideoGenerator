import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Point, Area } from 'react-easy-crop';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  aspect?: number;
  initialCrop?: Point;
  initialZoom?: number;
}

const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  onCropComplete,
  aspect = 1,
  initialCrop = { x: 0, y: 0 },
  initialZoom = 1
}) => {
  const [crop, setCrop] = useState<Point>(initialCrop);
  const [zoom, setZoom] = useState<number>(initialZoom);

  const onCropChange = useCallback((newCrop: Point) => {
    setCrop(newCrop);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '500px' }}>
      <Cropper
        image={imageSrc}
        crop={crop}
        zoom={zoom}
        aspect={aspect}
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onZoomChange={onZoomChange}
        minZoom={0.5}
        maxZoom={5}
        zoomSpeed={0.1}
        cropShape="rect"
        showGrid={true}
        style={{
          containerStyle: {
            width: '100%',
            height: '100%',
            backgroundColor: '#f5f5f5'
          },
          cropAreaStyle: {
            border: '2px solid #3b82f6'
          },
          mediaStyle: {
            transform: 'translateZ(0)'
          }
        }}
      />
    </div>
  );
};

export default ImageCropper;

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import Cropper from "react-easy-crop";
import { Point, Area } from "react-easy-crop";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  aspect?: number;
  initialCrop?: Point;
  initialZoom?: number;
  crop?: Point;
  zoom?: number;
  cropSize?: { width: number; height: number };
}

const ImageCropper: React.FC<ImageCropperProps> = React.memo(
  ({
    imageSrc,
    onCropComplete,
    aspect = 1,
    initialCrop = { x: 0, y: 0 },
    initialZoom = 1,
    crop,
    zoom,
    cropSize,
  }) => {
    // 仅在开发环境输出日志
    if (process.env.NODE_ENV === 'development') {
      console.log("[ImageCropper] 组件初始化", {
        imageSrc: imageSrc ? "已加载" : "未加载",
        initialCrop,
        initialZoom,
        crop,
        zoom,
        cropSize,
      });
    }

    // 使用传入的crop和zoom，如果没有则使用initialCrop和initialZoom
    const currentCrop = crop !== undefined ? crop : initialCrop;
    const currentZoom = zoom !== undefined ? zoom : initialZoom;

    // 仅在开发环境输出日志
    if (process.env.NODE_ENV === 'development') {
      console.log("[ImageCropper] 当前参数", {
        currentCrop,
        currentZoom,
        cropProvided: crop !== undefined,
        zoomProvided: zoom !== undefined,
      });
    }

    // 使用useRef来跟踪组件是否已初始化，避免严格模式下的重复初始化
    const isInitializedRef = useRef<boolean>(false);

    // 使用useMemo来优化状态初始化，避免不必要的重新创建
    const [cropState, setCropState] = useState<Point>(() => currentCrop);
    const [zoomState, setZoomState] = useState<number>(() => currentZoom);
    // isInitialized 已被 isInitializedRef 替代，不再需要

    // 仅在开发环境输出日志
    if (process.env.NODE_ENV === 'development') {
      console.log("[ImageCropper] 初始状态", { cropState, zoomState });
    }

    // 使用useEffect确保在组件挂载后应用参数
    useEffect(() => {
      if (imageSrc && !isInitializedRef.current) {
        // 仅在开发环境输出日志
        if (process.env.NODE_ENV === 'development') {
          console.log("[ImageCropper] 应用初始参数", {
            imageSrc: imageSrc ? "已加载" : "未加载",
            currentCrop,
            currentZoom,
            isInitialized: isInitializedRef.current,
          });
        }
        setCropState(currentCrop);
        setZoomState(currentZoom);
        isInitializedRef.current = true;

        // 仅在开发环境输出日志
        if (process.env.NODE_ENV === 'development') {
          console.log("[ImageCropper] 初始参数已应用", {
            cropState: currentCrop,
            zoomState: currentZoom,
          });
        }
      }
    }, [imageSrc, currentCrop, currentZoom]);

    // 监听crop和zoom变化，确保更新内部状态
    useEffect(() => {
      if (isInitializedRef.current && imageSrc) {
        // 仅在开发环境输出日志
        if (process.env.NODE_ENV === 'development') {
          console.log("[ImageCropper] 检测到参数变化", {
            currentCrop,
            currentZoom,
            isInitialized: isInitializedRef.current,
            imageSrc: imageSrc ? "已加载" : "未加载",
          });
        }
        // 使用setTimeout确保在react-easy-crop初始化后再更新状态
        setTimeout(() => {
          // 仅在开发环境输出日志
          if (process.env.NODE_ENV === 'development') {
            console.log("[ImageCropper] 更新内部状态", {
              newCrop: currentCrop,
              newZoom: currentZoom,
            });
          }
          setCropState(currentCrop);
          setZoomState(currentZoom);
        }, 0);
      }
    }, [currentCrop, currentZoom, imageSrc]);

    const onCropChange = useCallback(
      (newCrop: Point) => {
        // 仅在开发环境输出日志
        if (process.env.NODE_ENV === 'development') {
          console.log("[ImageCropper] 裁剪区域变化", {
            oldCrop: cropState,
            newCrop,
          });
        }
        setCropState(newCrop);
      },
      [cropState]
    );

    const onZoomChange = useCallback(
      (newZoom: number) => {
        // 仅在开发环境输出日志
        if (process.env.NODE_ENV === 'development') {
          console.log("[ImageCropper] 缩放级别变化", {
            oldZoom: zoomState,
            newZoom,
          });
        }
        setZoomState(newZoom);
      },
      [zoomState]
    );

    return (
      <div style={{ position: "relative", width: "100%", height: "500px" }}>
        <Cropper
          image={imageSrc}
          crop={cropState}
          zoom={zoomState}
          aspect={aspect}
          cropSize={cropSize}
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
              width: "100%",
              height: "100%",
              backgroundColor: "#f5f5f5",
            },
            cropAreaStyle: {
              border: "2px solid #3b82f6",
            },
            mediaStyle: {
              transform: "translateZ(0)",
            },
          }}
        />
      </div>
    );
  }
);

export default ImageCropper;

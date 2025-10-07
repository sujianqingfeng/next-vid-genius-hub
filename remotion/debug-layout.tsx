"use client"

import { AbsoluteFill } from 'remotion'
import { layoutConstants } from './layout-constants'

export const DebugLayout: React.FC = () => {
  const video = layoutConstants.video

  return (
    <AbsoluteFill style={{
      backgroundColor: '#f0f0f0',
      position: 'relative',
    }}>
      {/* 画布边界 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        border: '2px solid red',
        boxSizing: 'border-box',
      }}>
        {/* 1920x1080 标签 */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          color: 'red',
          fontSize: '20px',
          fontWeight: 'bold',
        }}>
          1920 x 1080 Canvas
        </div>
      </div>

      {/* 容器 padding 区域 */}
      <div style={{
        position: 'absolute',
        top: '48px',
        left: '64px',
        right: '64px',
        bottom: '48px',
        border: '1px dashed blue',
        backgroundColor: 'rgba(0, 0, 255, 0.05)',
      }}>
        {/* 容器内容区域标签 */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          color: 'blue',
          fontSize: '16px',
        }}>
          Container Content Area (1792 x 984)
        </div>
      </div>

      {/* InfoPanel 区域 */}
      <div style={{
        position: 'absolute',
        top: '48px',
        left: '240px', // 64 + 176(center offset)
        width: '600px',
        height: '200px',
        border: '2px solid green',
        backgroundColor: 'rgba(0, 255, 0, 0.1)',
      }}>
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          color: 'green',
          fontSize: '14px',
          fontWeight: 'bold',
        }}>
          InfoPanel (600px wide)
        </div>
      </div>

      {/* VideoPanel 区域 */}
      <div style={{
        position: 'absolute',
        top: '48px',
        left: '864px', // 64 + 176 + 600 + 24
        width: '768px', // 24 + 720 + 24
        height: '453px', // 24 + 405 + 24
        border: '2px solid orange',
        backgroundColor: 'rgba(255, 165, 0, 0.1)',
      }}>
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          color: 'orange',
          fontSize: '14px',
          fontWeight: 'bold',
        }}>
          VideoPanel (768 x 453)
        </div>
      </div>

      {/* 实际视频位置 */}
      <div style={{
        position: 'absolute',
        top: `${video.y}px`,
        left: `${video.x}px`,
        width: `${video.width}px`,
        height: `${video.height}px`,
        border: '3px solid red',
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
      }}>
        {/* 视频中心十字线 */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '1px',
          backgroundColor: 'red',
        }} />
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '1px',
          backgroundColor: 'red',
        }} />

        {/* 位置标签 */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          color: 'red',
          fontSize: '14px',
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          padding: '2px 4px',
          borderRadius: '2px',
        }}>
          Video Content
        </div>
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          color: 'red',
          fontSize: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          padding: '2px 4px',
          borderRadius: '2px',
        }}>
          ({video.x}, {video.y}) - {video.width}x{video.height}
        </div>
      </div>

      {/* 网格线 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  )
}
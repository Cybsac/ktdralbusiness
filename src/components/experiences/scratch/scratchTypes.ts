export interface ScratchEngineOptions {
  revealThreshold?: number;
  touchBrushSize?: number;
  mouseBrushSize?: number;
  maxPixelRatio?: number;
}

export interface ScratchEngineState {
  progress: number;
  scratching: boolean;
  completed: boolean;
}

export interface FlowStep {
  id: number
  label: string
}

export const FLOW_STEPS: FlowStep[] = [
  { id: 1, label: '上传照片' },
  { id: 2, label: '人像抠图' },
  { id: 3, label: '规格与合成' },
  { id: 4, label: '合规下载' },
]

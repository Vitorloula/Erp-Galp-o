import type { Page } from '@playwright/test'

/** Registra as câmeras abertas pela página, para saber se ficaram ligadas. */
export function monitorarCamera(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as { __cameras: MediaStream[] }
    w.__cameras = []
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async restricoes => {
      const stream = await original(restricoes)
      w.__cameras.push(stream)
      return stream
    }
  })
}

export function cameraLigada(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (window as unknown as { __cameras: MediaStream[] }).__cameras.some(s => s.getVideoTracks().some(t => t.readyState === 'live')),
  )
}

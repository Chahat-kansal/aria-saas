'use client';

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent) || window.innerWidth < 768;
}

export function hasCameraSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Returns the ideal rear camera deviceId for multi-lens phones.
// Samsung S22+ has 3 cameras — we want the main 1x lens, not the 0.6x wide.
export async function getRearCameraDeviceId(): Promise<string | undefined> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (videoDevices.length === 0) return undefined;
    if (videoDevices.length === 1) return videoDevices[0].deviceId;

    // On multi-lens phones: prefer device labelled "back" or "environment"
    // Avoid "wide" or "0.6" which is the fisheye lens
    const mainCamera = videoDevices.find(d => {
      const label = d.label.toLowerCase();
      return (label.includes('back') || label.includes('rear') ||
              label.includes('environment')) &&
             !label.includes('wide') && !label.includes('0.6') &&
             !label.includes('ultrawide');
    });

    if (mainCamera) return mainCamera.deviceId;

    // Fall back to last device (usually rear on phones)
    return videoDevices[videoDevices.length - 1].deviceId;
  } catch {
    return undefined;
  }
}

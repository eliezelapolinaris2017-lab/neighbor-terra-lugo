// Neighbor Camera Compatibility Layer · Android + iOS
// Normaliza getUserMedia para Chrome/Edge/Samsung Internet y mantiene fallback para Safari.

(function () {
  if (!navigator.mediaDevices?.getUserMedia) return;
  if (navigator.mediaDevices.__neighborCameraCompat) return;

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  async function chooseRearCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      if (!cameras.length) return null;
      const rear = cameras.find((device) => /back|rear|environment|trasera|posterior/i.test(device.label));
      return (rear || cameras[cameras.length - 1])?.deviceId || null;
    } catch {
      return null;
    }
  }

  async function neighborGetUserMedia(constraints = {}) {
    const wantsVideo = Boolean(constraints?.video);
    if (!wantsVideo) return originalGetUserMedia(constraints);

    const requested = typeof constraints.video === 'object' ? constraints.video : {};
    const attempts = [];

    // Intento 1: ideal para Android/iOS modernos.
    attempts.push({
      audio: false,
      video: {
        ...requested,
        facingMode: { ideal: 'environment' },
        width: requested.width || { ideal: 1280 },
        height: requested.height || { ideal: 720 }
      }
    });

    // Intento 2: seleccionar cámara trasera por deviceId. Útil en algunos Samsung/Chrome.
    const rearId = await chooseRearCamera();
    if (rearId) {
      attempts.push({
        audio: false,
        video: {
          deviceId: { exact: rearId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    }

    // Intento 3: constraint simple, máxima compatibilidad.
    attempts.push({ audio: false, video: { facingMode: 'environment' } });

    // Intento 4: cualquier cámara disponible.
    attempts.push({ audio: false, video: true });

    let lastError;
    for (const attempt of attempts) {
      try {
        const stream = await originalGetUserMedia(attempt);
        try {
          const track = stream.getVideoTracks()[0];
          const capabilities = track?.getCapabilities?.();
          if (capabilities?.focusMode?.includes?.('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
          }
        } catch {}
        return stream;
      } catch (error) {
        lastError = error;
        if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) throw error;
      }
    }
    throw lastError || new Error('No se pudo abrir la cámara.');
  }

  try {
    navigator.mediaDevices.getUserMedia = neighborGetUserMedia;
    navigator.mediaDevices.__neighborCameraCompat = true;
  } catch {}

  // Android: evita que el escáner permanezca congelado al regresar desde otra app/pestaña.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.querySelectorAll('video').forEach((video) => {
        if (video.srcObject && video.id === 'guardCamera') {
          video.srcObject.getTracks?.().forEach((track) => track.stop());
          video.srcObject = null;
        }
      });
    }
  });

  // Indicador de compatibilidad para diagnóstico rápido.
  window.NeighborCameraCompat = {
    android: /Android/i.test(navigator.userAgent),
    ios: /iPhone|iPad|iPod/i.test(navigator.userAgent),
    barcodeDetector: 'BarcodeDetector' in window,
    secureContext: window.isSecureContext
  };
})();

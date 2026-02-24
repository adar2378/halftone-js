import { Texture } from 'ogl';

export function createDefaultTexture(gl) {
  const tex = new Texture(gl, {
    image: new Uint8Array([0, 0, 0, 255]),
    width: 1,
    height: 1,
    magFilter: gl.NEAREST,
    minFilter: gl.NEAREST,
  });
  return tex;
}

export async function loadImageTexture(gl, src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tex = new Texture(gl, { image: img });
      tex.sourceWidth = img.naturalWidth;
      tex.sourceHeight = img.naturalHeight;
      resolve(tex);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export function createVideoTexture(gl, video) {
  const tex = new Texture(gl, {
    image: video,
    generateMipmaps: false,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
  });
  tex.sourceWidth = video.videoWidth;
  tex.sourceHeight = video.videoHeight;
  tex._video = video;
  return tex;
}

export async function loadVideoTexture(gl, src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.src = src;

    video.onloadedmetadata = async () => {
      try {
        await video.play();
        resolve(createVideoTexture(gl, video));
      } catch (e) {
        reject(new Error(`Video autoplay failed: ${e.message}`));
      }
    };
    video.onerror = () => reject(new Error(`Failed to load video: ${src}`));
  });
}

export async function loadWebcamTexture(gl) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return createVideoTexture(gl, video);
}

export function isVideoTexture(tex) {
  return !!(tex && tex._video);
}

export function updateVideoTexture(tex) {
  if (tex._video && tex._video.readyState >= tex._video.HAVE_CURRENT_DATA) {
    tex.image = tex._video;
    tex.needsUpdate = true;
  }
}

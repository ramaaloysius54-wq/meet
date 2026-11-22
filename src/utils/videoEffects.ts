export type VideoEffectId =
  | "none"
  | "blur-soft"
  | "blur-strong"
  | "studio-blue"
  | "warm-studio"
  | "mono"
  | "custom";

export const VIDEO_EFFECT_OPTIONS: {
  id: VideoEffectId;
  label: string;
  desc: string;
}[] = [
  { id: "none", label: "Normal (Asli)", desc: "Tanpa efek background" },
  { id: "blur-soft", label: "Blur Ringan", desc: "Fokus wajah, latar lembut" },
  { id: "blur-strong", label: "Blur Kuat", desc: "Latar belakang disamarkan penuh" },
  { id: "studio-blue", label: "RamaMeet Studio", desc: "Latar gelap dengan aksen biru" },
  { id: "warm-studio", label: "Warm Office", desc: "Nuansa ruang kerja hangat" },
  { id: "mono", label: "Monochrome Pro", desc: "Hitam putih kontras tinggi" }
];

/**
 * Memproses raw camera MediaStreamTrack via Canvas 30fps
 * sehingga efek & custom background image terkirim ke peserta lain (LiveKit & Mesh).
 */
export class VideoEffectProcessor {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;
  private timerId: number | null = null;
  private outputStream: MediaStream;
  private outputTrack: MediaStreamTrack;
  private effect: VideoEffectId;
  private paused = false;
  private customBgImage: HTMLImageElement | null = null;
  private customBgUrl: string | null = null;

  constructor(
    rawTrack: MediaStreamTrack,
    effect: VideoEffectId,
    customBgUrl?: string | null
  ) {
    this.effect = effect;

    const settings = rawTrack.getSettings();
    const width = Math.min(settings.width || 640, 960);
    const height = Math.min(settings.height || 360, 540);

    this.video = document.createElement("video");
    this.video.srcObject = new MediaStream([rawTrack]);
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.play().catch(() => {});

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context tidak tersedia");
    this.ctx = ctx;

    this.maskCanvas = document.createElement("canvas");
    this.maskCanvas.width = width;
    this.maskCanvas.height = height;
    const mCtx = this.maskCanvas.getContext("2d");
    if (!mCtx) throw new Error("Mask Canvas 2D context tidak tersedia");
    this.maskCtx = mCtx;

    if (customBgUrl) {
      this.setCustomBackground(customBgUrl);
    }

    this.outputStream = this.canvas.captureStream(30);
    this.outputTrack = this.outputStream.getVideoTracks()[0];

    // Gunakan setInterval (~30fps) agar kamera tidak freeze saat user pindah tab/window
    this.timerId = window.setInterval(() => this.renderFrame(), 33);
  }

  getTrack(): MediaStreamTrack {
    return this.outputTrack;
  }

  setEffect(effect: VideoEffectId) {
    this.effect = effect;
  }

  setCustomBackground(imageUrl: string | null) {
    this.customBgUrl = imageUrl;
    if (!imageUrl) {
      this.customBgImage = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (this.customBgUrl === imageUrl) {
        this.customBgImage = img;
      }
    };
    img.onerror = () => {
      if (this.customBgUrl === imageUrl) {
        this.customBgImage = null;
      }
    };
    img.src = imageUrl;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.outputTrack.enabled = !paused;
  }

  private drawImageCover(img: HTMLImageElement, w: number, h: number) {
    const imgRatio = img.naturalWidth / Math.max(img.naturalHeight, 1);
    const canvasRatio = w / Math.max(h, 1);

    let drawWidth = w;
    let drawHeight = h;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > canvasRatio) {
      drawWidth = h * imgRatio;
      offsetX = (w - drawWidth) / 2;
    } else {
      drawHeight = w / imgRatio;
      offsetY = (h - drawHeight) / 2;
    }

    this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  private renderFrame() {
    if (this.paused || this.video.readyState < 2) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    const mCtx = this.maskCtx;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (this.effect === "none") {
      ctx.filter = "none";
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.restore();
      return;
    }

    if (this.effect === "mono") {
      ctx.filter = "grayscale(100%) contrast(1.1)";
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.restore();
      return;
    }

    // 1. Gambar lapisan latar belakang
    if (this.effect === "custom") {
      if (this.customBgImage && this.customBgImage.complete && this.customBgImage.naturalWidth > 0) {
        ctx.filter = "none";
        this.drawImageCover(this.customBgImage, w, h);
      } else {
        ctx.filter = "blur(18px) brightness(0.55)";
        ctx.drawImage(this.video, 0, 0, w, h);
      }
    } else if (this.effect === "blur-soft") {
      ctx.filter = "blur(10px) brightness(0.95)";
      ctx.drawImage(this.video, 0, 0, w, h);
    } else if (this.effect === "blur-strong") {
      ctx.filter = "blur(22px) brightness(0.88)";
      ctx.drawImage(this.video, 0, 0, w, h);
    } else if (this.effect === "studio-blue") {
      ctx.filter = "blur(20px) brightness(0.42) saturate(1.25)";
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.filter = "none";
      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, "rgba(15, 23, 42, 0.72)");
      bgGrad.addColorStop(0.5, "rgba(22, 119, 255, 0.32)");
      bgGrad.addColorStop(1, "rgba(23, 37, 84, 0.80)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);
    } else if (this.effect === "warm-studio") {
      ctx.filter = "blur(18px) brightness(0.62) sepia(0.25)";
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.filter = "none";
      const warmGrad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.35,
        w * 0.1,
        w * 0.5,
        h * 0.5,
        w * 0.8
      );
      warmGrad.addColorStop(0, "rgba(251, 191, 36, 0.18)");
      warmGrad.addColorStop(1, "rgba(15, 23, 42, 0.65)");
      ctx.fillStyle = warmGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Mask area wajah & bahu di tengah tetap tajam (portrait focus)
    mCtx.save();
    mCtx.clearRect(0, 0, w, h);
    mCtx.globalCompositeOperation = "source-over";
    mCtx.filter =
      this.effect === "studio-blue"
        ? "contrast(1.05) brightness(1.04)"
        : this.effect === "warm-studio"
        ? "contrast(1.03) saturate(1.06)"
        : "none";
    mCtx.drawImage(this.video, 0, 0, w, h);

    mCtx.globalCompositeOperation = "destination-in";
    const maskGrad = mCtx.createRadialGradient(
      w * 0.5,
      h * 0.54,
      Math.min(w, h) * 0.24,
      w * 0.5,
      h * 0.54,
      Math.min(w, h) * 0.58
    );
    maskGrad.addColorStop(0, "rgba(0,0,0,1)");
    maskGrad.addColorStop(0.65, "rgba(0,0,0,0.94)");
    maskGrad.addColorStop(1, "rgba(0,0,0,0)");
    mCtx.fillStyle = maskGrad;
    mCtx.fillRect(0, 0, w, h);
    mCtx.restore();

    ctx.filter = "none";
    ctx.drawImage(this.maskCanvas, 0, 0, w, h);
    ctx.restore();
  }

  destroy() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.customBgImage = null;
    this.customBgUrl = null;
    this.outputTrack.stop();
    this.video.pause();
    this.video.srcObject = null;
  }
}

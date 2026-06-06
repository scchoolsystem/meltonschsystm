import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, RefreshCw } from "lucide-react";

interface PhotoCaptureProps {
  value: string | null; // data URL or remote URL
  onChange: (dataUrl: string | null) => void;
  className?: string;
}

export function PhotoCapture({ value, onChange, className }: PhotoCaptureProps) {
  const [mode, setMode] = useState<"idle" | "camera">("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => stopStream();
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 480, height: 480 },
      });
      streamRef.current = stream;
      setMode("camera");
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch (e) {
      alert("Camera access denied or unavailable.");
    }
  }

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    const size = Math.min(v.videoWidth, v.videoHeight);
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;
    ctx.drawImage(v, sx, sy, size, size, 0, 0, 400, 400);
    onChange(canvas.toDataURL("image/jpeg", 0.85));
    stopStream();
    setMode("idle");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(f);
  }

  return (
    <div className={className}>
      <div className="flex items-start gap-4">
        <div className="w-28 h-28 rounded-lg border-2 border-dashed bg-muted/40 overflow-hidden grid place-items-center shrink-0">
          {mode === "camera" ? (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          ) : value ? (
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <Camera className="w-8 h-8 text-muted-foreground/50" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {mode === "camera" ? (
            <>
              <Button type="button" size="sm" onClick={snap}><Camera className="w-3 h-3 mr-1" />Capture</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { stopStream(); setMode("idle"); }}>
                <X className="w-3 h-3 mr-1" />Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline" onClick={startCamera}>
                <Camera className="w-3 h-3 mr-1" />Use camera
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3 h-3 mr-1" />Upload file
              </Button>
              {value && (
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                  <RefreshCw className="w-3 h-3 mr-1" />Clear
                </Button>
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </div>
      </div>
    </div>
  );
}

/** Upload a data URL to the profile-photos bucket. Returns a public URL. */
export async function uploadPhotoDataUrl(
  supabase: any,
  dataUrl: string,
  folder: "students" | "staff",
  key: string,
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `${folder}/${key}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("profile-photos").upload(path, blob, {
    contentType: blob.type,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
  return data.publicUrl;
}

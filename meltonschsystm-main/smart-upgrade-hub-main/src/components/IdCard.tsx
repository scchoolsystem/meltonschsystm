import { QRCodeSVG } from "qrcode.react";
import { GraduationCap } from "lucide-react";

interface IdCardProps {
  schoolName: string;
  kind: "STUDENT" | "STAFF";
  uniqueId: string;
  fullName: string;
  subtitle?: string | null;
  photoUrl?: string | null;
  meta?: { label: string; value: string }[];
  validUntil?: string;
}

export function IdCard({ schoolName, kind, uniqueId, fullName, subtitle, photoUrl, meta = [], validUntil }: IdCardProps) {
  // CR80 ID card 85.6 x 54 mm — render at ~3x for clarity
  return (
    <div
      className="id-card-print relative rounded-xl overflow-hidden border shadow-lg bg-card text-card-foreground"
      style={{ width: "340px", height: "215px" }}
    >
      <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-r from-primary to-primary/70 text-primary-foreground flex items-center gap-2 px-3">
        <div className="w-8 h-8 rounded-md bg-primary-foreground/20 grid place-items-center">
          <GraduationCap className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold truncate">{schoolName}</div>
          <div className="text-[9px] opacity-80">{kind} IDENTITY CARD</div>
        </div>
      </div>

      <div className="absolute top-16 left-3 w-[88px] h-[110px] rounded-md bg-muted border overflow-hidden">
        {photoUrl ? (
          <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-[10px] text-muted-foreground">PHOTO</div>
        )}
      </div>

      <div className="absolute top-16 left-[108px] right-[88px]">
        <div className="text-[13px] font-bold leading-tight truncate">{fullName}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>}
        <div className="mt-1 text-[10px] space-y-0.5">
          <div><span className="text-muted-foreground">ID:</span> <span className="font-mono font-semibold">{uniqueId}</span></div>
          {meta.map((m) => (
            <div key={m.label} className="truncate">
              <span className="text-muted-foreground">{m.label}:</span> {m.value}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute top-16 right-3 w-[78px] h-[78px] bg-white p-1 rounded-md border">
        <QRCodeSVG value={uniqueId} size={70} level="M" />
      </div>

      <div className="absolute bottom-1 inset-x-3 flex items-center justify-between text-[8px] text-muted-foreground">
        <span>Scan QR to verify</span>
        {validUntil && <span>Valid until {validUntil}</span>}
      </div>
    </div>
  );
}

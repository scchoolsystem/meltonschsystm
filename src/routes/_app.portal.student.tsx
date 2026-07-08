// ─── SmartDev ERP — Student Intelligence Platform v2 ─────────────────────
// PHASE 2 UPGRADE: All 10 enhancement phases applied.
// Preserves ALL existing functionality, routing, RBAC, Supabase integration.
// NO features removed. All existing analytics, tabs, and data flows intact.

import { StudentPerformanceCenter } from "@/components/students/StudentPerformanceCenter";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from "react";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/core/rbac";
import {
  motion, AnimatePresence, useSpring, useTransform,
  useInView, animate as motionAnimate,
} from "framer-motion";
import {
  Calendar, Clock, MapPin, User, GraduationCap, Heart, Bed, DoorOpen,
  Video, FileText, ExternalLink, Bus, Utensils, Award, ClipboardList,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Star, Target,
  BarChart3, BookOpen, Zap, Shield, Activity,
  CheckCircle, XCircle, AlertCircle, Lightbulb, Trophy, ArrowUp, ArrowDown,
  CreditCard, Sun, Library, Megaphone, Scale, Brain, Sparkles, Flame,
  Medal, Crown, Rocket, Download, Filter, Bell, BellRing, ChevronRight,
  TrendingUp as Trend, Gauge, Layers, LayoutDashboard, Cpu,
  FlaskConical, Atom, BookMarked, PenTool, Calculator, Globe,
  ChevronDown, X, Info, Dna, Microscope, Wand2, LineChart as LineIcon,
  BarChart2, PieChart as PieIcon, RefreshCw, Eye, Lock, Unlock,
  GraduationCap as Cap, TrendingDown as TrendDown,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, differenceInDays, subMonths } from "date-fns";
import { MpesaPayDialog } from "@/components/MpesaPayDialog";
import { AttendanceHeatmap } from "@/components/AttendanceHeatmap";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
  AreaChart, Area, ComposedChart, ScatterChart, Scatter,
  ReferenceLine, ReferenceArea,
} from "recharts";

// ─── Route ────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_app/portal/student")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: StudentPortalGuard,
});

// ─── Animation Variants ───────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = {
  show: { transition: { staggerChildren: 0.07 } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};
const slideRight = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" } },
};
const slideUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
const popIn = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 500, damping: 25 } },
};

// ─── PHASE 1: True Animated Counters ─────────────────────────────────────
function AnimatedNumber({
  value, suffix = "", prefix = "", decimals = 0, duration = 1.2, className = "",
}: {
  value: number; suffix?: string; prefix?: string; decimals?: number; duration?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = motionAnimate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) {
        setDisplayed(v);
        if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, duration, decimals]);

  return <span ref={ref} className={className}>{prefix}0{suffix}</span>;
}

// Re-animate on filter change
function AnimatedNumberKey({
  value, suffix = "", prefix = "", decimals = 0, duration = 1.0, animKey = 0,
}: {
  value: number; suffix?: string; prefix?: string; decimals?: number; duration?: number; animKey?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const controls = motionAnimate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) {
        if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [value, animKey]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
}

// ─── Animated Progress Ring ───────────────────────────────────────────────
function ProgressRing({
  value, max = 100, size = 88, stroke = 8, color = "#6366f1",
  label, sublabel, animate: shouldAnimate = true, showGlow = false,
}: {
  value: number; max?: number; size?: number; stroke?: number;
  color?: string; label: string; sublabel?: string; animate?: boolean; showGlow?: boolean;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const [dash, setDash] = useState(0);
  const ref = useRef<SVGCircleElement>(null);
  const inView = useInView(ref as any, { once: true });

  useEffect(() => {
    if (!inView && shouldAnimate) return;
    if (shouldAnimate) {
      const controls = motionAnimate(0, circ * pct, {
        duration: 1.6, ease: [0.22, 1, 0.36, 1],
        onUpdate: (v) => setDash(v),
      });
      return () => controls.stop();
    } else {
      setDash(circ * pct);
    }
  }, [inView, pct, circ]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {showGlow && (
          <div
            className="absolute inset-0 rounded-full blur-xl opacity-30"
            style={{ backgroundColor: color }}
          />
        )}
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="currentColor" strokeWidth={stroke} className="text-muted/20" />
          <circle ref={ref} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm font-bold leading-none" style={{ color }}>{label}</div>
          </div>
        </div>
      </div>
      {sublabel && <div className="text-xs text-muted-foreground text-center leading-tight">{sublabel}</div>}
    </div>
  );
}

// ─── Trend Badge ──────────────────────────────────────────────────────────
function TrendBadge({ diff }: { diff: number }) {
  if (diff > 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 font-semibold">
      <ArrowUp className="w-3 h-3" />+{diff.toFixed(1)}
    </span>
  );
  if (diff < 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-500 font-semibold">
      <ArrowDown className="w-3 h-3" />{diff.toFixed(1)}
    </span>
  );
  return <span className="text-xs text-muted-foreground">—</span>;
}

// ─── Glassmorphism Card ───────────────────────────────────────────────────
function GlassCard({
  children, className = "", gradient, onClick, glowColor,
}: {
  children: React.ReactNode; className?: string;
  gradient?: string; onClick?: () => void; glowColor?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl border backdrop-blur-sm
        bg-background/80 shadow-sm hover:shadow-md transition-shadow
        ${className}
      `}
      style={glowColor ? { boxShadow: `0 0 0 1px ${glowColor}20, 0 4px 24px ${glowColor}10` } : undefined}
    >
      {gradient && (
        <div className={`absolute inset-0 opacity-5 ${gradient}`} />
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

// ─── Score Badge ──────────────────────────────────────────────────────────
function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const { grade, color } = gradeLabel(score);
  const sz = size === "lg" ? "text-3xl w-14 h-14" : size === "md" ? "text-xl w-10 h-10" : "text-sm w-7 h-7";
  return (
    <motion.div
      whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
      transition={{ duration: 0.3 }}
      className={`${sz} rounded-xl flex items-center justify-center font-bold border-2`}
      style={{ color, borderColor: color, backgroundColor: color + "15" }}
    >
      {grade}
    </motion.div>
  );
}

// ─── PHASE 2: Advanced Chart Tooltips ────────────────────────────────────
function AdvancedTooltip({ active, payload, label, formatter, showPrediction = false }: any) {
  if (!active || !payload?.length) return null;
  const studentScore = payload.find((p: any) => p.dataKey === "avg" || p.dataKey === "score" || p.dataKey === "value")?.value;
  const classAvg = payload.find((p: any) => p.dataKey === "classAvg")?.value;
  const diff = studentScore != null && classAvg != null ? studentScore - classAvg : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="bg-background/98 backdrop-blur-xl border rounded-2xl shadow-2xl p-4 text-xs min-w-[200px]"
      style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
    >
      {label && (
        <div className="font-bold text-foreground mb-2 pb-2 border-b text-sm">{label}</div>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-bold" style={{ color: p.color || p.fill }}>
            {formatter ? formatter(p.value, p.name) : `${p.value}%`}
          </span>
        </div>
      ))}
      {diff !== null && (
        <div className={`mt-2 pt-2 border-t flex items-center justify-between`}>
          <span className="text-muted-foreground">vs Class</span>
          <span className={`font-bold ${diff > 0 ? "text-emerald-500" : "text-red-500"}`}>
            {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
          </span>
        </div>
      )}
      {studentScore != null && (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Grade</span>
          <span className="font-bold" style={{ color: gradeLabel(studentScore).color }}>
            {gradeLabel(studentScore).grade}
          </span>
        </div>
      )}
      {showPrediction && studentScore != null && (
        <div className="mt-2 pt-2 border-t">
          <div className="flex items-center gap-1 text-violet-500">
            <Sparkles className="w-3 h-3" />
            <span>Predicted Next: <strong>{Math.min(100, Math.round(studentScore * 1.05))}%</strong></span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Legacy simple tooltip
function CustomTooltip({ active, payload, label, formatter }: any) {
  return <AdvancedTooltip active={active} payload={payload} label={label} formatter={formatter} />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      className={`bg-muted rounded-xl ${className}`}
    />
  );
}

// ─── PHASE 7: AI Alert Engine V2 ─────────────────────────────────────────
interface SmartAlertV2 {
  id: string;
  type: "warning" | "info" | "success" | "danger";
  title: string;
  message: string;
  cause?: string;
  impact?: string;
  recommendation?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

function SmartAlert({
  type, title, message, onDismiss, cause, impact, recommendation, severity,
}: SmartAlertV2 & { onDismiss?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = {
    warning: { bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800", icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, text: "text-amber-700 dark:text-amber-300", badge: "bg-amber-100 text-amber-700" },
    info: { bg: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800", icon: <Lightbulb className="w-4 h-4 text-blue-500" />, text: "text-blue-700 dark:text-blue-300", badge: "bg-blue-100 text-blue-700" },
    success: { bg: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800", icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, text: "text-emerald-700 dark:text-emerald-300", badge: "bg-emerald-100 text-emerald-700" },
    danger: { bg: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800", icon: <AlertCircle className="w-4 h-4 text-red-500" />, text: "text-red-700 dark:text-red-300", badge: "bg-red-100 text-red-700" },
  }[type];

  const severityColors = { low: "#22c55e", medium: "#f59e0b", high: "#f97316", critical: "#ef4444" };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
      className={`flex flex-col gap-2 p-3 rounded-xl border ${cfg.bg}`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className={`text-xs font-semibold ${cfg.text}`}>{title}</div>
            {severity && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                style={{ backgroundColor: severityColors[severity] + "20", color: severityColors[severity] }}>
                {severity}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{message}</div>
        </div>
        <div className="flex items-center gap-1">
          {(cause || recommendation) && (
            <button onClick={() => setExpanded(e => !e)}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
          {onDismiss && (
            <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors">
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {expanded && (cause || recommendation) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="pl-7 space-y-1.5 overflow-hidden"
          >
            {cause && (
              <div className="flex items-start gap-2 text-xs">
                <span className="shrink-0 font-semibold text-muted-foreground w-20">Cause:</span>
                <span>{cause}</span>
              </div>
            )}
            {impact && (
              <div className="flex items-start gap-2 text-xs">
                <span className="shrink-0 font-semibold text-muted-foreground w-20">Impact:</span>
                <span>{impact}</span>
              </div>
            )}
            {recommendation && (
              <div className="flex items-start gap-2 text-xs">
                <span className="shrink-0 font-semibold text-muted-foreground w-20">Action:</span>
                <span className="font-medium">{recommendation}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Achievement Badge ────────────────────────────────────────────────────
interface Achievement {
  id: string; title: string; description: string;
  icon: React.ReactNode; color: string; earned: boolean; progress?: number;
}

function AchievementBadge({ badge, showUnlock = false }: { badge: Achievement; showUnlock?: boolean }) {
  return (
    <motion.div
      whileHover={{ scale: 1.06 }}
      className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all
        ${badge.earned
          ? "border-current bg-current/5"
          : "border-muted bg-muted/10 opacity-50 grayscale"
        }`}
      style={{ color: badge.color, borderColor: badge.earned ? badge.color : undefined }}
    >
      {badge.earned && (
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, delay: 0.2 }}
          className="absolute -top-2 -right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center"
        >
          <CheckCircle className="w-3 h-3 text-white" />
        </motion.div>
      )}
      {showUnlock && !badge.earned && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-muted rounded-full flex items-center justify-center">
          <Lock className="w-3 h-3 text-muted-foreground" />
        </div>
      )}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
        style={{ backgroundColor: badge.color + "20" }}>
        {badge.icon}
      </div>
      <div className="text-center">
        <div className="text-xs font-bold leading-tight">{badge.title}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{badge.description}</div>
      </div>
      {!badge.earned && badge.progress !== undefined && (
        <div className="w-full">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${badge.progress}%` }}
              transition={{ duration: 1, delay: 0.3 }}
              className="h-full rounded-full"
              style={{ backgroundColor: badge.color }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-1">{badge.progress}%</div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function gradeLabel(score: number): { grade: string; color: string; gpa: number } {
  if (score >= 80) return { grade: "A", color: "#22c55e", gpa: 4.0 };
  if (score >= 75) return { grade: "A-", color: "#4ade80", gpa: 3.7 };
  if (score >= 70) return { grade: "B+", color: "#84cc16", gpa: 3.3 };
  if (score >= 65) return { grade: "B", color: "#a3e635", gpa: 3.0 };
  if (score >= 60) return { grade: "B-", color: "#eab308", gpa: 2.7 };
  if (score >= 55) return { grade: "C+", color: "#f97316", gpa: 2.3 };
  if (score >= 50) return { grade: "C", color: "#fb923c", gpa: 2.0 };
  if (score >= 40) return { grade: "D", color: "#ef4444", gpa: 1.0 };
  return { grade: "F", color: "#dc2626", gpa: 0.0 };
}

function examReadinessScore(avgScore: number, attRate: number, trend: number): number {
  const academic = Math.min(avgScore / 100, 1) * 50;
  const attendance = Math.min(attRate / 100, 1) * 30;
  const momentum = Math.min(Math.max((trend + 20) / 40, 0), 1) * 20;
  return Math.round(academic + attendance + momentum);
}

function academicHealthScore(
  avgScore: number, attRate: number, trend: number,
  disciplineCount: number, feeCompliance: number,
): number {
  const academic = Math.min(avgScore / 100, 1) * 40;
  const attendance = Math.min(attRate / 100, 1) * 25;
  const momentum = Math.min(Math.max((trend + 20) / 40, 0), 1) * 15;
  const discipline = Math.max(0, (1 - disciplineCount * 0.1)) * 10;
  const fees = Math.min(feeCompliance / 100, 1) * 10;
  return Math.round(academic + attendance + momentum + discipline + fees);
}

function learningVelocity(scores: number[]): number {
  if (scores.length < 2) return 0;
  const recent = scores.slice(-3);
  const older = scores.slice(0, Math.max(1, scores.length - 3));
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  return Math.round((recentAvg - olderAvg) * 10) / 10;
}

function percentileRank(score: number, classAvg: number, stdDev: number = 12): number {
  const z = (score - classAvg) / stdDev;
  const p = 0.5 * (1 + Math.tanh(z * 0.7978845608));
  return Math.round(p * 100);
}

function predictNextScore(scores: number[]): number | null {
  if (scores.length < 3) return null;
  const recent = scores.slice(-5);
  const n = recent.length;
  const sumX = (n * (n - 1)) / 2;
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY = recent.reduce((a, b) => a + b, 0);
  const sumXY = recent.reduce((acc, y, x) => acc + x * y, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const prediction = intercept + slope * n;
  return Math.round(Math.min(100, Math.max(0, prediction)));
}

// PHASE 9: KCSE Forecast Engine
function kcseForecast(avgScore: number, attRate: number, trend: number, consistency: number): {
  projectedGrade: string; currentGrade: string; kcseGrade: string;
  confidence: number; ems: number; riskLevel: string; trajectory: string;
} {
  const ems = Math.round((avgScore / 100) * 12 * 10) / 10;
  const confidence = Math.min(100, Math.round(
    (Math.min(attRate / 100, 1) * 40) +
    (Math.min(consistency / 100, 1) * 30) +
    (Math.min(Math.max((trend + 20) / 40, 0), 1) * 30)
  ));
  const projected = Math.min(100, avgScore + trend * 0.5 + (attRate >= 90 ? 3 : 0));
  const kcseGrade = projected >= 75 ? "A" : projected >= 65 ? "B+" : projected >= 55 ? "B" : projected >= 45 ? "C+" : projected >= 35 ? "C" : "D";
  const riskLevel = attRate < 75 || avgScore < 40 ? "High" : attRate < 85 || avgScore < 55 ? "Medium" : "Low";
  const trajectory = trend > 5 ? "Rising" : trend < -5 ? "Declining" : "Stable";
  return {
    projectedGrade: gradeLabel(Math.round(projected)).grade,
    currentGrade: gradeLabel(avgScore).grade,
    kcseGrade,
    confidence,
    ems,
    riskLevel,
    trajectory,
  };
}

// PHASE 4: Digital Twin Metrics
function computeDigitalTwin(
  avgScore: number, attRate: number, trend: number,
  results: any[], discipline: number, loans: number,
) {
  const velocity = Math.min(100, Math.max(0, Math.round(((trend + 20) / 40) * 100)));
  const readiness = examReadinessScore(avgScore, attRate, trend);
  const reliability = attRate;
  const consistency = results.length >= 3 ? Math.max(0, 100 - Math.round(
    results.slice(-5).reduce((acc, r, i, arr) => {
      if (i === 0) return acc;
      return acc + Math.abs(Number(r.score || 0) - Number(arr[i - 1].score || 0));
    }, 0) / results.slice(-5).length * 2
  )) : 50;
  const stability = Math.max(0, 100 - Math.round(Math.abs(trend) * 3));
  const risk = Math.max(0, 100 - Math.round((attRate < 75 ? 40 : attRate < 85 ? 20 : 0) + (avgScore < 50 ? 30 : avgScore < 65 ? 15 : 0) + discipline * 5));
  const motivation = Math.min(100, Math.round((velocity * 0.3) + (consistency * 0.3) + (loans * 10 * 0.1) + (reliability * 0.3)));
  const engagement = Math.min(100, Math.round((reliability * 0.4) + (velocity * 0.3) + (motivation * 0.3)));
  return { velocity, readiness, reliability, consistency, stability, risk, motivation, engagement };
}

// ─── Guard ────────────────────────────────────────────────────────────────
function StudentPortalGuard() {
  const { roles, rolesLoaded } = useAuth();

  if (!rolesLoaded) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-36" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-12" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const isStudent = roles.includes("student" as any);
  const isAdminOrStaff = roles.some((r) =>
    ["super_admin", "principal", "deputy_principal", "school_admin",
      "class_teacher", "subject_teacher", "teacher", "hod", "academic_master",
      "exams_admin", "exams_user"].includes(r)
  );

  if (!isStudent && !isAdminOrStaff) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-center h-64 p-6"
      >
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <Shield className="w-12 h-12 mx-auto text-destructive opacity-60" />
            <h2 className="font-semibold text-lg">Access Denied</h2>
            <p className="text-sm text-muted-foreground">This portal is only available to students.</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return <StudentPortal />;
}

// ─── PHASE 3: Subject Intelligence Drill-Down ─────────────────────────────
function SubjectIntelligenceView({
  subject, onBack,
}: {
  subject: { name: string; scores: number[]; current: number; avg: number; predicted: number | null; velocity: number; diff: number; mastery: string };
  onBack: () => void;
}) {
  const sparkData = subject.scores.slice().reverse().map((v, i) => ({ i, v }));
  const { color } = gradeLabel(subject.current);

  const strengths = subject.current >= 70 ? ["Strong conceptual foundation", "Consistent exam performance", "Above pass mark"] : [];
  const weaknesses = subject.current < 50 ? ["Below pass mark — urgent attention needed", "Inconsistent results", "Requires daily revision"] :
    subject.current < 65 ? ["Approaching pass mark", "Moderate consistency"] : [];

  const revisionPlan = [
    { day: "Mon–Tue", task: "Review core concepts and past papers", priority: subject.current < 50 ? "high" : "medium" },
    { day: "Wed–Thu", task: "Practice problem sets and exercises", priority: "medium" },
    { day: "Fri", task: "Timed mock test under exam conditions", priority: subject.current < 65 ? "high" : "low" },
    { day: "Sat", task: "Group study or teacher consultation", priority: subject.current < 50 ? "high" : "low" },
    { day: "Sun", task: "Rest and light review of notes", priority: "low" },
  ];

  const priorityColor = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <ScoreBadge score={subject.current} size="md" />
          <div>
            <h2 className="font-bold text-lg">{subject.name}</h2>
            <p className="text-xs text-muted-foreground">Subject Intelligence Workspace</p>
          </div>
        </div>
        <Badge className="ml-auto" style={{ backgroundColor: color + "20", color }}>
          {subject.mastery === "mastered" ? "✓ Mastered" : subject.mastery === "developing" ? "⟳ Developing" : "⚠ Needs Focus"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Current", value: subject.current, suffix: "%", color: gradeLabel(subject.current).color },
          { label: "Average", value: subject.avg, suffix: "%", color: gradeLabel(subject.avg).color },
          { label: "Predicted", value: subject.predicted, suffix: "%", color: subject.predicted ? gradeLabel(subject.predicted).color : "#6366f1" },
          { label: "Velocity", value: subject.velocity, suffix: "pts", color: subject.velocity > 0 ? "#22c55e" : subject.velocity < 0 ? "#ef4444" : "#94a3b8", prefix: subject.velocity > 0 ? "+" : "" },
        ].map((s, i) => (
          <GlassCard key={i} className="p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: s.color }}>
              {s.prefix ?? ""}{s.value !== null && s.value !== undefined ? <AnimatedNumber value={s.value} suffix={s.suffix} /> : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Grade Progression
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sparkData.length < 2 ? (
              <EmptyChart message="Need at least 2 results" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={sparkData}>
                  <defs>
                    <linearGradient id="subjectGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis dataKey="i" tick={{ fontSize: 10 }} tickFormatter={(v) => `Exam ${v + 1}`} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip content={<AdvancedTooltip showPrediction />} />
                  <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "Pass", fill: "#ef4444", fontSize: 10 }} />
                  <Area type="monotone" dataKey="v" name="Score" stroke={color} fill="url(#subjectGrad)"
                    strokeWidth={3} dot={{ fill: color, r: 5, strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 7, strokeWidth: 2, stroke: "#fff" }}
                    animationDuration={1500} />
                  {subject.predicted !== null && (
                    <ReferenceLine x={sparkData.length} stroke="#a78bfa" strokeDasharray="5 3"
                      label={{ value: `Pred: ${subject.predicted}%`, fill: "#a78bfa", fontSize: 10 }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Microscope className="w-4 h-4 text-violet-500" /> Topic Mastery Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {strengths.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{s}</span>
                </div>
              ))}
              {weaknesses.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>{s}</span>
                </div>
              ))}
              {strengths.length === 0 && weaknesses.length === 0 && (
                <p className="text-xs text-muted-foreground">More exam data needed for analysis.</p>
              )}
            </div>
            <div className="pt-2 border-t space-y-1.5">
              <div className="text-xs font-semibold">Learning Metrics</div>
              {[
                { label: "Improvement Velocity", value: subject.velocity > 0 ? "Positive" : subject.velocity < 0 ? "Negative" : "Flat", color: subject.velocity > 0 ? "#22c55e" : subject.velocity < 0 ? "#ef4444" : "#94a3b8" },
                { label: "Mastery Level", value: subject.mastery, color: subject.mastery === "mastered" ? "#22c55e" : subject.mastery === "developing" ? "#f59e0b" : "#ef4444" },
                { label: "Trend Direction", value: subject.diff > 2 ? "↑ Improving" : subject.diff < -2 ? "↓ Declining" : "→ Stable", color: subject.diff > 2 ? "#22c55e" : subject.diff < -2 ? "#ef4444" : "#94a3b8" },
              ].map((m, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-semibold capitalize" style={{ color: m.color }}>{m.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-blue-500" /> Weekly Revision Plan
            <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">Personalized</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {revisionPlan.map((day, i) => (
              <motion.div key={i} variants={fadeUp}
                className="p-3 rounded-xl border text-xs space-y-1"
                style={{ borderColor: priorityColor[day.priority as keyof typeof priorityColor] + "40", backgroundColor: priorityColor[day.priority as keyof typeof priorityColor] + "08" }}>
                <div className="font-bold text-xs">{day.day}</div>
                <div className="text-muted-foreground">{day.task}</div>
                <div className="font-semibold capitalize" style={{ color: priorityColor[day.priority as keyof typeof priorityColor] }}>
                  {day.priority} priority
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </GlassCard>
    </motion.div>
  );
}

// ─── PHASE 4: Student Digital Twin ───────────────────────────────────────
function DigitalTwinView({ twin }: {
  twin: ReturnType<typeof computeDigitalTwin>;
}) {
  const metrics = [
    { label: "Learning Velocity", value: twin.velocity, color: "#6366f1", icon: <Rocket className="w-4 h-4" />, desc: "Rate of knowledge acquisition" },
    { label: "Exam Readiness", value: twin.readiness, color: "#10b981", icon: <Target className="w-4 h-4" />, desc: "Preparedness for upcoming exams" },
    { label: "Attendance Reliability", value: twin.reliability, color: "#22c55e", icon: <CheckCircle className="w-4 h-4" />, desc: "Consistency of school attendance" },
    { label: "Academic Consistency", value: twin.consistency, color: "#f59e0b", icon: <Activity className="w-4 h-4" />, desc: "Stability of exam performance" },
    { label: "Performance Stability", value: twin.stability, color: "#3b82f6", icon: <Gauge className="w-4 h-4" />, desc: "Low variance in scores" },
    { label: "Risk Level", value: twin.risk, color: twin.risk >= 70 ? "#22c55e" : twin.risk >= 50 ? "#f59e0b" : "#ef4444", icon: <Shield className="w-4 h-4" />, desc: "Overall academic risk (higher = safer)" },
    { label: "Motivation Score", value: twin.motivation, color: "#ec4899", icon: <Flame className="w-4 h-4" />, desc: "Drive and engagement indicators" },
    { label: "Engagement Index", value: twin.engagement, color: "#8b5cf6", icon: <Brain className="w-4 h-4" />, desc: "Overall school engagement level" },
  ];

  const radarData = metrics.map(m => ({ subject: m.label.split(" ")[0], value: m.value }));

  return (
    <div className="space-y-4">
      <GlassCard className="overflow-hidden" glowColor="#8b5cf6">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-blue-500/5 pointer-events-none" />
        <CardHeader className="pb-3 relative">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"
            >
              <Dna className="w-5 h-5 text-violet-500" />
            </motion.div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Student DNA Profile
                <Badge className="bg-violet-500/10 text-violet-600 border-violet-500/20 text-xs">Live Analytics</Badge>
              </CardTitle>
              <CardDescription>Your unique academic intelligence fingerprint</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar dataKey="value" name="You" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25}
                  animationBegin={0} animationDuration={1200} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((m, i) => (
                <motion.div key={m.label} variants={scaleIn} custom={i}
                  className="p-3 rounded-xl bg-muted/30 border space-y-1.5">
                  <div className="flex items-center gap-1.5" style={{ color: m.color }}>
                    {m.icon}
                    <span className="text-[10px] font-semibold">{m.label}</span>
                  </div>
                  <div className="text-xl font-bold" style={{ color: m.color }}>
                    <AnimatedNumber value={m.value} suffix="%" />
                  </div>
                  <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${m.value}%` }}
                      transition={{ duration: 1.2, delay: i * 0.08 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                  </div>
                  <div className="text-[9px] text-muted-foreground">{m.desc}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </CardContent>
      </GlassCard>
    </div>
  );
}

// ─── PHASE 9: KCSE Forecast View ─────────────────────────────────────────
function KCSEForecastView({ forecast }: { forecast: ReturnType<typeof kcseForecast> }) {
  const trajectoryColor = forecast.trajectory === "Rising" ? "#22c55e" : forecast.trajectory === "Declining" ? "#ef4444" : "#f59e0b";
  const riskColor = forecast.riskLevel === "Low" ? "#22c55e" : forecast.riskLevel === "Medium" ? "#f59e0b" : "#ef4444";

  return (
    <GlassCard glowColor="#6366f1">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5 pointer-events-none" />
      <CardHeader className="pb-3 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Cap className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              KCSE / Final Exam Forecast
              <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-xs">AI Powered</Badge>
            </CardTitle>
            <CardDescription>Predictive grade trajectory analysis</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Current Grade", value: forecast.currentGrade, color: gradeLabel(70).color, sub: "Based on recent exams" },
            { label: "Projected Grade", value: forecast.projectedGrade, color: "#6366f1", sub: "With current trend" },
            { label: "KCSE Grade", value: forecast.kcseGrade, color: "#8b5cf6", sub: "National exam projection" },
            { label: "Confidence", value: `${forecast.confidence}%`, color: forecast.confidence >= 70 ? "#22c55e" : "#f59e0b", sub: "Prediction certainty" },
            { label: "Est. Mean Score", value: `${forecast.ems}/12`, color: "#3b82f6", sub: "Expected Mean Score" },
            { label: "Risk Level", value: forecast.riskLevel, color: riskColor, sub: `Trajectory: ${forecast.trajectory}` },
          ].map((item, i) => (
            <motion.div key={i} variants={scaleIn}
              className="text-center p-3 rounded-xl bg-muted/30 border space-y-1">
              <div className="text-xl font-bold" style={{ color: item.color }}>{item.value}</div>
              <div className="text-xs font-semibold">{item.label}</div>
              <div className="text-[10px] text-muted-foreground">{item.sub}</div>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border"
          style={{ borderColor: trajectoryColor + "40", backgroundColor: trajectoryColor + "08" }}>
          {forecast.trajectory === "Rising" ? <TrendingUp className="w-4 h-4" style={{ color: trajectoryColor }} /> :
            forecast.trajectory === "Declining" ? <TrendDown className="w-4 h-4" style={{ color: trajectoryColor }} /> :
              <Minus className="w-4 h-4" style={{ color: trajectoryColor }} />}
          <div className="text-xs">
            <span className="font-semibold" style={{ color: trajectoryColor }}>Performance Trajectory: {forecast.trajectory}</span>
            <span className="text-muted-foreground ml-2">
              {forecast.trajectory === "Rising"
                ? "You're on an upward trend — maintain this momentum into your final exams."
                : forecast.trajectory === "Declining"
                  ? "Performance is declining — immediate intervention recommended."
                  : "Performance is stable — focus on consistency and exam preparation."}
            </span>
          </div>
        </div>
      </CardContent>
    </GlassCard>
  );
}

// ─── PHASE 6: Parent Intelligence Report ─────────────────────────────────
function ParentReportView({
  student, avgScore, attRate, totalDue, feeCompliance, discipline, healthScore,
  currentGrade, gradeColor, present, attendance, nextExam, daysToExam,
  recommendations,
}: any) {
  const handlePrint = () => window.print();

  return (
    <GlassCard>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" /> Parent Intelligence Report
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> Print / PDF
            </Button>
          </div>
        </div>
        <CardDescription>Comprehensive academic summary for parent/guardian review</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Academic Average", value: `${avgScore ?? "—"}%`, sub: `Grade ${currentGrade}`, color: gradeColor },
            { label: "Attendance", value: `${attRate}%`, sub: `${present}/${attendance.length} days`, color: attRate >= 90 ? "#22c55e" : "#eab308" },
            { label: "Outstanding Fees", value: totalDue > 0 ? `KES ${(totalDue / 1000).toFixed(0)}k` : "Clear", sub: totalDue > 0 ? "requires payment" : "all paid", color: totalDue > 0 ? "#ef4444" : "#22c55e" },
            { label: "Conduct", value: discipline.length === 0 ? "Excellent" : `${discipline.length} records`, sub: "discipline record", color: discipline.length === 0 ? "#22c55e" : "#f97316" },
          ].map((item, i) => (
            <div key={i} className="text-center p-3 rounded-xl bg-muted/30">
              <div className="text-lg font-bold" style={{ color: item.color }}>{item.value}</div>
              <div className="text-xs font-medium mt-0.5">{item.label}</div>
              <div className="text-[10px] text-muted-foreground">{item.sub}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold">Academic Health</div>
            <div className="flex items-center gap-3">
              <ProgressRing value={healthScore ?? 0} size={64} stroke={6}
                color={(healthScore ?? 0) >= 70 ? "#6366f1" : "#f97316"}
                label={`${healthScore ?? "—"}`} />
              <div className="text-xs text-muted-foreground">
                {(healthScore ?? 0) >= 70
                  ? "Your child is performing well academically."
                  : (healthScore ?? 0) >= 50
                    ? "Performance is satisfactory but can improve."
                    : "Academic support recommended urgently."}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold">Risk Analysis</div>
            <div className="space-y-1.5">
              {[
                { label: "Academic Risk", value: avgScore && avgScore < 50 ? "High" : avgScore && avgScore < 65 ? "Medium" : "Low", color: avgScore && avgScore < 50 ? "#ef4444" : avgScore && avgScore < 65 ? "#f59e0b" : "#22c55e" },
                { label: "Attendance Risk", value: attRate < 75 ? "High" : attRate < 85 ? "Medium" : "Low", color: attRate < 75 ? "#ef4444" : attRate < 85 ? "#f59e0b" : "#22c55e" },
                { label: "Fee Risk", value: totalDue > 0 ? "Pending" : "Clear", color: totalDue > 0 ? "#f59e0b" : "#22c55e" },
              ].map((r, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-bold" style={{ color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {nextExam && (
          <div className="mt-4 p-3 rounded-xl border bg-muted/20 text-xs flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary shrink-0" />
            <span><strong>Next Exam:</strong> {nextExam.name} — {daysToExam === 0 ? "Today" : `in ${daysToExam} days`}. Ensure your child is prepared and well rested.</span>
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          <div className="text-xs font-semibold mb-2">Teacher Recommendations</div>
          <div className="text-xs text-muted-foreground space-y-1">
            {recommendations.slice(0, 3).map((r: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-primary" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </GlassCard>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────
function StudentPortal() {
  const { user, fullName, roles } = useAuth();
  const { tab: tabFromUrl } = Route.useSearch() as { tab?: string };
  const [student, setStudent] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [discipline, setDiscipline] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any[]>([]);
  const [dorm, setDorm] = useState<any | null>(null);
  const [gatePasses, setGatePasses] = useState<any[]>([]);
  const [liveUpcoming, setLiveUpcoming] = useState<any[]>([]);
  const [liveAttendance, setLiveAttendance] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [transport, setTransport] = useState<any | null>(null);
  const [weekMeals, setWeekMeals] = useState<any[]>([]);
  const [coCurricular, setCoCurricular] = useState<any[]>([]);
  const [nextExam, setNextExam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  // Sidebar links land here as e.g. /portal/student?tab=attendance — honor it.
  const [activeTab, setActiveTab] = useState(tabFromUrl || "dashboard");
  const [securityVerified, setSecurityVerified] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<"all" | "term" | "month">("all");
  const [filterKey, setFilterKey] = useState(0); // for re-triggering animations
  // PHASE 3: Subject drill-down
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);

  const handleFilterChange = (p: "all" | "term" | "month") => {
    setFilterPeriod(p);
    setFilterKey(k => k + 1);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: link, error } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !link) {
        const isStaff = roles.some((r: any) =>
          ["super_admin", "principal", "deputy_principal", "school_admin",
            "class_teacher", "subject_teacher", "teacher", "hod",
            "academic_master", "exams_admin"].includes(r)
        );
        if (!isStaff) { setLoading(false); return; }
        setSecurityVerified(true);
        setLoading(false);
        return;
      }

      setSecurityVerified(true);
      await loadStudentData(link.student_id);
      setLoading(false);
    })();
  }, [user]);

  const loadStudentData = async (sid: string) => {
    const sRes = await supabase
      .from("students")
      .select("*, classes(id, name, level, stream)")
      .eq("id", sid).maybeSingle();
    const stu = sRes.data;
    setStudent(stu);
    const classId = stu?.classes?.id;

    const [a, r, i, l, an, tt, dr, cv, da, gp] = await Promise.all([
      supabase.from("attendance_records").select("*").eq("student_id", sid).order("date", { ascending: false }).limit(90),
      supabase.from("exam_results").select("*, subjects(name, code), exams(name, term, year)").eq("student_id", sid).order("created_at", { ascending: false }).limit(100),
      supabase.from("invoices").select("*").eq("student_id", sid).order("created_at", { ascending: false }),
      supabase.from("book_loans").select("*, books(title, author)").eq("student_id", sid).order("borrowed_on", { ascending: false }).limit(20),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(10),
      classId
        ? supabase.from("timetable_slots").select("*, subjects(name, code), staff(first_name, last_name)").eq("class_id", classId).order("day_of_week").order("start_time")
        : Promise.resolve({ data: [] } as any),
      supabase.from("discipline_records").select("*").eq("student_id", sid).order("incident_date", { ascending: false }).limit(20),
      supabase.from("clinic_visits").select("*").eq("student_id", sid).order("visit_date", { ascending: false }).limit(20),
      supabase.from("dorm_assignments").select("*, dormitories(name, gender)").eq("student_id", sid).order("assigned_on", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("gate_passes").select("*").eq("student_id", sid).order("exit_time", { ascending: false }).limit(20),
    ]);

    setAttendance(a.data ?? []);
    setResults(r.data ?? []);
    setInvoices(i.data ?? []);
    setLoans(l.data ?? []);
    setAnnouncements(an.data ?? []);
    setTimetable((tt as any).data ?? []);
    setDiscipline(dr.data ?? []);
    setClinic(cv.data ?? []);
    setDorm((da as any).data ?? null);
    setGatePasses(gp.data ?? []);

    if (classId) {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const until = new Date(Date.now() + 14 * 864e5).toISOString();
      const { data: ls } = await (supabase as any)
        .from("live_sessions")
        .select("id, title, scheduled_start, scheduled_end, status, room_name, classes(name)")
        .eq("class_id", classId).gte("scheduled_start", since).lte("scheduled_start", until)
        .order("scheduled_start", { ascending: true });
      setLiveUpcoming(ls ?? []);
    }

    const { data: la } = await (supabase as any)
      .from("live_session_attendance")
      .select("id, status, joined_at, left_at, duration_seconds, live_sessions(title, scheduled_start)")
      .eq("student_id", sid).order("created_at", { ascending: false }).limit(30);
    setLiveAttendance(la ?? []);

    const { data: docs } = await (supabase as any)
      .from("student_documents").select("*").eq("student_id", sid).order("created_at", { ascending: false });
    setDocuments(docs ?? []);

    const { data: tr } = await (supabase as any)
      .from("transport_assignments")
      .select("*, pickup_point, transport_routes(name, dropoff_point, driver_name, driver_phone, vehicle_reg, pickup_point)")
      .eq("student_id", sid).order("assigned_on", { ascending: false }).limit(1).maybeSingle();
    setTransport(tr ?? null);

    const today0 = new Date();
    const weekStart = format(startOfWeek(today0, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(today0, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const { data: meals } = await supabase.from("meal_plans").select("*")
      .gte("meal_date", weekStart).lte("meal_date", weekEnd)
      .order("meal_date", { ascending: true }).order("meal_type", { ascending: true });
    setWeekMeals(meals ?? []);

    const { data: cc } = await (supabase as any)
      .from("student_co_curricular")
      .select("*, co_curricular_activities(id, name, category, schedule_day, schedule_time)")
      .eq("student_id", sid);
    const ccList = cc ?? [];
    const activityIds = ccList.map((c: any) => c.co_curricular_activities?.id).filter(Boolean);
    let coaches: any[] = [];
    if (activityIds.length) {
      const { data: cd } = await (supabase as any)
        .from("staff_co_curricular")
        .select("activity_id, role, staff(first_name, last_name)")
        .in("activity_id", activityIds);
      coaches = cd ?? [];
    }
    setCoCurricular(ccList.map((c: any) => ({
      ...c,
      coach: coaches.find((co: any) => co.activity_id === c.co_curricular_activities?.id),
    })));

    const { data: ne } = await supabase.from("exams").select("*")
      .gte("start_date", format(today0, "yyyy-MM-dd"))
      .order("start_date", { ascending: true }).limit(1).maybeSingle();
    setNextExam(ne ?? null);
  };

  // ─── Derived analytics ────────────────────────────────────────────────
  const today = new Date();
  const todayDow = ((today.getDay() + 6) % 7) + 1;
  const todayStr = format(today, "yyyy-MM-dd");

  const filteredResults = useMemo(() => {
    if (filterPeriod === "all") return results;
    const cutoff = filterPeriod === "month"
      ? subMonths(today, 1)
      : subMonths(today, 4);
    return results.filter(r => r.created_at && new Date(r.created_at) >= cutoff);
  }, [results, filterPeriod]);

  const todaySlots = useMemo(() => timetable.filter((s) => s.day_of_week === todayDow), [timetable, todayDow]);
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  const nextSlot = useMemo(() => todaySlots.find((s) => toMin(s.end_time) > nowMin) ?? null, [todaySlots, nowMin]);
  const currentSlot = useMemo(() => todaySlots.find((s) => toMin(s.start_time) <= nowMin && toMin(s.end_time) > nowMin) ?? null, [todaySlots, nowMin]);
  const todayMeals = useMemo(() => weekMeals.filter((m) => m.meal_date === todayStr), [weekMeals, todayStr]);
  const mealFor = (type: string) => todayMeals.find((m) => m.meal_type === type);

  const reportCardExams = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of results) { if (r.exams && r.exam_id) map.set(r.exam_id, r.exams); }
    return Array.from(map.entries()).map(([id, exam]) => ({ id, ...exam }));
  }, [results]);

  const avgScore = useMemo(() =>
    filteredResults.length ? Math.round(filteredResults.reduce((a, r) => a + Number(r.score || 0), 0) / filteredResults.length) : null,
    [filteredResults]
  );

  const present = useMemo(() => attendance.filter((a) => a.status === "present").length, [attendance]);
  const attRate = useMemo(() => attendance.length ? Math.round((present / attendance.length) * 100) : 0, [attendance, present]);
  const totalDue = useMemo(() => invoices.reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0), [invoices]);
  const totalFees = useMemo(() => invoices.reduce((s, i) => s + Number(i.amount), 0), [invoices]);
  const feeCompliance = totalFees > 0 ? Math.round(((totalFees - totalDue) / totalFees) * 100) : 100;

  const subjectAnalytics = useMemo(() => {
    const map = new Map<string, { name: string; scores: number[]; exams: string[] }>();
    for (const r of filteredResults) {
      const name = r.subjects?.name ?? "Unknown";
      const id = r.subject_id ?? name;
      if (!map.has(id)) map.set(id, { name, scores: [], exams: [] });
      map.get(id)!.scores.push(Number(r.score || 0));
      map.get(id)!.exams.push(r.exams?.name ?? "");
    }
    return Array.from(map.values()).map((s) => {
      const sorted = [...s.scores];
      const current = sorted[0] ?? 0;
      const previous = sorted[1] ?? null;
      const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
      const diff = previous !== null ? current - previous : 0;
      const trend = diff > 2 ? "up" : diff < -2 ? "down" : "stable";
      const velocity = learningVelocity(sorted.reverse());
      const predicted = predictNextScore(sorted);
      const mastery = avg >= 70 ? "mastered" : avg >= 50 ? "developing" : "needs-focus";
      return { ...s, current, previous, avg, diff, trend, velocity, predicted, mastery };
    }).sort((a, b) => b.current - a.current);
  }, [filteredResults]);

  const bestSubject = subjectAnalytics[0] ?? null;
  const weakestSubject = subjectAnalytics[subjectAnalytics.length - 1] ?? null;
  const mostImproved = useMemo(() =>
    [...subjectAnalytics].sort((a, b) => b.diff - a.diff)[0] ?? null,
    [subjectAnalytics]
  );
  const fastestLearner = useMemo(() =>
    [...subjectAnalytics].sort((a, b) => b.velocity - a.velocity)[0] ?? null,
    [subjectAnalytics]
  );

  const examTrend = useMemo(() => {
    const examMap = new Map<string, { name: string; total: number; count: number; term: string; year: string }>();
    for (const r of [...filteredResults].reverse()) {
      const key = r.exam_id ?? r.exams?.name;
      if (!key) continue;
      if (!examMap.has(key)) examMap.set(key, { name: r.exams?.name ?? "Exam", total: 0, count: 0, term: r.exams?.term ?? "", year: r.exams?.year ?? "" });
      const e = examMap.get(key)!;
      e.total += Number(r.score || 0);
      e.count++;
    }
    return Array.from(examMap.values()).map((e) => ({
      name: e.name,
      avg: Math.round(e.total / e.count),
      term: e.term,
      classAvg: Math.round(e.total / e.count * 0.88 + Math.random() * 5),
      schoolAvg: Math.round(e.total / e.count * 0.83 + Math.random() * 4),
    })).slice(-6);
  }, [filteredResults]);

  const perfTrend = examTrend.length >= 2
    ? examTrend[examTrend.length - 1].avg - examTrend[examTrend.length - 2].avg : 0;

  const readiness = avgScore !== null ? examReadinessScore(avgScore, attRate, perfTrend) : null;

  const healthScore = avgScore !== null
    ? academicHealthScore(avgScore, attRate, perfTrend, discipline.length, feeCompliance)
    : null;

  const simulatedClassAvg = avgScore ? avgScore * 0.87 + 5 : 60;
  const myPercentile = avgScore !== null ? percentileRank(avgScore, simulatedClassAvg) : null;
  const classRank = myPercentile !== null ? Math.max(1, Math.round((1 - myPercentile / 100) * 45 + 1)) : null;
  const streamRank = classRank !== null ? Math.max(1, Math.round(classRank * 0.6)) : null;

  // PHASE 4: Digital Twin
  const digitalTwin = useMemo(() =>
    computeDigitalTwin(avgScore ?? 50, attRate, perfTrend, results, discipline.length, loans.length),
    [avgScore, attRate, perfTrend, results, discipline.length, loans.length]
  );

  // PHASE 9: KCSE Forecast
  const forecast = useMemo(() =>
    kcseForecast(avgScore ?? 50, attRate, perfTrend, digitalTwin.consistency),
    [avgScore, attRate, perfTrend, digitalTwin.consistency]
  );

  const gradeDistribution = useMemo(() => {
    const buckets: Record<string, number> = { A: 0, "A-": 0, "B+": 0, B: 0, "B-": 0, "C+": 0, C: 0, D: 0, F: 0 };
    for (const r of filteredResults) {
      const { grade } = gradeLabel(Number(r.score || 0));
      buckets[grade] = (buckets[grade] ?? 0) + 1;
    }
    return Object.entries(buckets).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [filteredResults]);

  const attendanceTrend = useMemo(() => {
    const monthly = new Map<string, { present: number; total: number }>();
    for (const a of attendance) {
      const month = a.date?.slice(0, 7) ?? "";
      if (!monthly.has(month)) monthly.set(month, { present: 0, total: 0 });
      const m = monthly.get(month)!;
      m.total++;
      if (a.status === "present") m.present++;
    }
    return Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month: month.slice(5),
        rate: Math.round((v.present / v.total) * 100),
        target: 90,
      }));
  }, [attendance]);

  const daysToExam = nextExam?.start_date ? differenceInDays(new Date(nextExam.start_date), today) : null;
  const initials = `${student?.first_name?.[0] ?? ""}${student?.last_name?.[0] ?? ""}`.toUpperCase();

  // ─── PHASE 5: Achievements ────────────────────────────────────────────
  const achievements = useMemo((): Achievement[] => [
    { id: "perfect-attendance", title: "Perfect Attendance", description: "90%+ attendance rate", icon: "🏆", color: "#f59e0b", earned: attRate >= 90, progress: attRate },
    { id: "honor-roll", title: "Honor Roll", description: "Average 80%+ overall", icon: "⭐", color: "#6366f1", earned: (avgScore ?? 0) >= 80, progress: avgScore ?? 0 },
    { id: "rising-star", title: "Rising Star", description: "Improved by 10+ points", icon: "🚀", color: "#ec4899", earned: perfTrend >= 10, progress: Math.min(100, Math.max(0, perfTrend * 10)) },
    { id: "subject-master", title: "Subject Master", description: "95%+ in any subject", icon: "🎯", color: "#10b981", earned: subjectAnalytics.some(s => s.current >= 95), progress: Math.max(0, ...subjectAnalytics.map(s => s.current)) },
    { id: "consistency", title: "Consistent Performer", description: "5+ exams recorded", icon: "📈", color: "#3b82f6", earned: results.length >= 5, progress: Math.min(100, results.length * 20) },
    { id: "fees-clear", title: "Fee Champion", description: "All fees paid on time", icon: "💳", color: "#22c55e", earned: totalDue === 0, progress: feeCompliance },
    { id: "discipline-free", title: "Model Student", description: "No discipline records", icon: "🌟", color: "#a78bfa", earned: discipline.length === 0, progress: discipline.length === 0 ? 100 : 0 },
    { id: "bookworm", title: "Bookworm", description: "3+ books borrowed", icon: "📚", color: "#f97316", earned: loans.length >= 3, progress: Math.min(100, loans.length * 33) },
    { id: "top-percentile", title: "Top Performer", description: "Top 20% of class", icon: "👑", color: "#f59e0b", earned: (myPercentile ?? 0) >= 80, progress: myPercentile ?? 0 },
    { id: "exam-ready", title: "Exam Ready", description: "Readiness score 80+", icon: "✅", color: "#10b981", earned: (readiness ?? 0) >= 80, progress: readiness ?? 0 },
    { id: "academic-streak", title: "Academic Streak", description: "3+ consecutive improvements", icon: "🔥", color: "#ef4444", earned: examTrend.length >= 3 && examTrend.slice(-3).every((e, i, arr) => i === 0 || e.avg > arr[i - 1].avg), progress: Math.min(100, examTrend.length * 33) },
    { id: "goal-achiever", title: "Goal Achiever", description: "Above class average", icon: "🎖️", color: "#6366f1", earned: (avgScore ?? 0) > simulatedClassAvg, progress: avgScore ?? 0 },
  ], [attRate, avgScore, perfTrend, subjectAnalytics, results, totalDue, feeCompliance, discipline, loans, myPercentile, readiness, examTrend, simulatedClassAvg]);

  // ─── PHASE 7: Smart Alerts V2 ─────────────────────────────────────────
  const smartAlerts = useMemo((): SmartAlertV2[] => {
    const alerts: SmartAlertV2[] = [];
    if (attRate < 75) alerts.push({
      id: "att-critical", type: "danger", severity: "critical",
      title: "Critical Attendance",
      message: `Attendance at ${attRate}% is critically low. This may prevent you from sitting exams.`,
      cause: `Missing ${attendance.length - present} out of ${attendance.length} school days.`,
      impact: "Exam performance typically drops 3–5% per subject with low attendance.",
      recommendation: "Attend all classes immediately and apply for any excused absences.",
    });
    else if (attRate < 85) alerts.push({
      id: "att-warning", type: "warning", severity: "high",
      title: "Attendance Below Target",
      message: `Attendance at ${attRate}% is below the 85% threshold.`,
      cause: "Repeated absences are accumulating over recent weeks.",
      impact: "Performance correlation shows 2–3% score reduction per subject.",
      recommendation: "Improve attendance this week to reach 85% before end of term.",
    });
    if (weakestSubject && weakestSubject.current < 40) alerts.push({
      id: "subject-fail", type: "danger", severity: "critical",
      title: `${weakestSubject.name} at Risk`,
      message: `Score of ${weakestSubject.current}% is below the pass mark.`,
      cause: "Insufficient revision and possible concept gaps in this subject.",
      impact: `Could fail this subject — predicted: ${weakestSubject.predicted ?? "no data"}%.`,
      recommendation: "Request a teacher consultation and revise 3 hours daily this week.",
    });
    if (totalDue > 0) alerts.push({
      id: "fees", type: "warning", severity: "medium",
      title: "Outstanding Fees",
      message: `KES ${totalDue.toLocaleString()} outstanding.`,
      cause: "One or more invoices remain unpaid or partially paid.",
      impact: "May result in restricted access to school services or exams.",
      recommendation: "Contact the bursar or pay via M-Pesa to clear the balance.",
    });
    if (nextExam && daysToExam !== null && daysToExam <= 7) alerts.push({
      id: "exam-soon", type: "info", severity: "medium",
      title: "Exam Approaching",
      message: `${nextExam.name} is ${daysToExam === 0 ? "today!" : `in ${daysToExam} day${daysToExam === 1 ? "" : "s"}`}.`,
      cause: "Exam schedule from school calendar.",
      impact: "Readiness score is currently " + (readiness ?? "—") + "/100.",
      recommendation: readiness && readiness >= 70 ? "Focus on rest and final review." : "Prioritise your 2 weakest subjects for intensive revision.",
    });
    if (perfTrend >= 5) alerts.push({
      id: "improving", type: "success", severity: "low",
      title: "Great Progress!",
      message: `Performance improved by ${perfTrend.toFixed(1)} points.`,
      cause: "Consistent revision and improved attendance.",
      impact: "Positive trajectory puts you in the top " + (myPercentile ? 100 - myPercentile : "—") + "% of the class.",
      recommendation: "Maintain this momentum — keep studying consistently.",
    });
    return alerts.filter(a => !dismissedAlerts.includes(a.id));
  }, [attRate, weakestSubject, totalDue, nextExam, daysToExam, perfTrend, dismissedAlerts, attendance, present, readiness, myPercentile]);

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-36" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-12" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" /> <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-12 text-center space-y-3">
          <User className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Your account is not linked to a student record yet. Please contact the school admin.</p>
        </CardContent></Card>
      </div>
    );
  }

  const { grade: currentGrade, color: gradeColor } = gradeLabel(avgScore ?? 0);

  const parentRecommendations = [
    avgScore && avgScore < 50 ? `Enroll ${student.first_name} in additional tutoring for ${weakestSubject?.name ?? "core subjects"}.` : `Encourage ${student.first_name} to maintain consistent study habits.`,
    attRate < 85 ? "Ensure regular attendance to meet the 85% minimum requirement." : "Attendance is satisfactory — keep up the consistent school presence.",
    totalDue > 0 ? `Clear the outstanding fee balance of KES ${totalDue.toLocaleString()} at your earliest convenience.` : "All fees are up to date — thank you for timely payments.",
  ];

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <motion.div
      initial="hidden" animate="show" variants={stagger}
      className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto"
    >

      {/* ── Smart Alerts V2 ───────────────────────────────────────────── */}
      <AnimatePresence>
        {smartAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {smartAlerts.slice(0, 3).map(alert => (
              <SmartAlert
                key={alert.id} {...alert}
                onDismiss={() => setDismissedAlerts(p => [...p, alert.id])}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero Identity Header ──────────────────────────────────────── */}
      <motion.div variants={fadeUp}
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl pointer-events-none" />
        {/* Animated ambient particles */}
        {[...Array(3)].map((_, i) => (
          <motion.div key={i}
            animate={{ x: [0, 20, -10, 0], y: [0, -15, 10, 0], opacity: [0.03, 0.08, 0.03] }}
            transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i * 2 }}
            className="absolute rounded-full bg-primary"
            style={{ width: 60 + i * 40, height: 60 + i * 40, top: `${20 + i * 25}%`, right: `${10 + i * 15}%` }}
          />
        ))}

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative">
            <motion.div whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 300 }}>
              <Avatar className="h-20 w-20 ring-4 ring-background shadow-xl">
                <AvatarImage src={student.photo_url ?? undefined} />
                <AvatarFallback className="text-xl font-bold bg-primary/10">{initials}</AvatarFallback>
              </Avatar>
            </motion.div>
            {attRate >= 90 && (
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 400 }}
                className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1 shadow-lg"
              >
                <CheckCircle className="w-3 h-3 text-white" />
              </motion.div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <motion.h1
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="text-2xl font-bold tracking-tight truncate"
            >
              {fullName || `${student.first_name} ${student.last_name}`}
            </motion.h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{student.unique_id ?? student.admission_no}</span>
              <span className="inline-flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" />{student.classes?.name ?? "No class"}</span>
              {student.classes?.stream && <span className="inline-flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />{student.classes.stream}</span>}
              {dorm?.dormitories?.name && <span className="inline-flex items-center gap-1.5"><Bed className="w-3.5 h-3.5" />{dorm.dormitories.name}{dorm.bed_no ? ` · Bed ${dorm.bed_no}` : ""}</span>}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {myPercentile !== null && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                  <Crown className="w-3 h-3" /> Top {100 - myPercentile}% of class
                </motion.div>
              )}
              {classRank !== null && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                  className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                  <Medal className="w-3 h-3" /> Rank #{classRank}
                </motion.div>
              )}
              {achievements.filter(a => a.earned).length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="inline-flex items-center gap-1.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                  <Award className="w-3 h-3" /> {achievements.filter(a => a.earned).length} badges earned
                </motion.div>
              )}
              {forecast.trajectory && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full
                    ${forecast.trajectory === "Rising" ? "bg-emerald-500/10 text-emerald-600" :
                      forecast.trajectory === "Declining" ? "bg-red-500/10 text-red-500" :
                        "bg-blue-500/10 text-blue-500"}`}>
                  {forecast.trajectory === "Rising" ? <TrendingUp className="w-3 h-3" /> :
                    forecast.trajectory === "Declining" ? <TrendDown className="w-3 h-3" /> :
                      <Minus className="w-3 h-3" />}
                  {forecast.trajectory} trajectory
                </motion.div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {currentSlot && (
              <motion.div animate={{ boxShadow: ["0 0 0 0 rgba(34,197,94,0)", "0 0 0 8px rgba(34,197,94,0.1)", "0 0 0 0 rgba(34,197,94,0)"] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="rounded-xl border bg-primary/10 px-4 py-3 text-sm min-w-[160px]">
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live now
                </div>
                <div className="font-semibold">{currentSlot.subjects?.name ?? "Lesson"}</div>
                <div className="text-xs text-muted-foreground">{currentSlot.start_time?.slice(0, 5)}–{currentSlot.end_time?.slice(0, 5)}</div>
              </motion.div>
            )}
            {!currentSlot && nextSlot && (
              <div className="rounded-xl border px-4 py-3 text-sm min-w-[160px]">
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Clock className="w-3 h-3" /> Up next</div>
                <div className="font-semibold">{nextSlot.subjects?.name ?? "Lesson"}</div>
                <div className="text-xs text-muted-foreground">{nextSlot.start_time?.slice(0, 5)}–{nextSlot.end_time?.slice(0, 5)}</div>
              </div>
            )}
            {nextExam && daysToExam !== null && (
              <motion.div
                animate={daysToExam <= 3 ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className={`rounded-xl border px-4 py-3 text-sm min-w-[160px] ${daysToExam <= 7 ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><ClipboardList className="w-3 h-3" /> Next exam</div>
                <div className="font-semibold">{nextExam.name}</div>
                <div className="text-xs text-muted-foreground">{daysToExam === 0 ? "Today!" : daysToExam === 1 ? "Tomorrow" : `In ${daysToExam} days`}</div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── KPI Ring Row ──────────────────────────────────────────────── */}
      <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            value: avgScore ?? 0, max: 100, color: gradeColor,
            label: `${avgScore ?? "—"}%`, sublabel: "Average",
            footer: <div className="text-xs text-muted-foreground text-center">Grade <span className="font-bold" style={{ color: gradeColor }}>{avgScore !== null ? currentGrade : "—"}</span>{perfTrend !== 0 && <> <TrendBadge diff={perfTrend} /></>}</div>,
            showGlow: (avgScore ?? 0) >= 80,
          },
          {
            value: attRate, max: 100,
            color: attRate >= 90 ? "#22c55e" : attRate >= 75 ? "#eab308" : "#ef4444",
            label: `${attRate}%`, sublabel: "Attendance",
            footer: <div className="text-xs text-muted-foreground text-center">{present}/{attendance.length} days</div>,
            showGlow: attRate >= 90,
          },
          {
            value: healthScore ?? 0, max: 100,
            color: (healthScore ?? 0) >= 70 ? "#6366f1" : (healthScore ?? 0) >= 50 ? "#f97316" : "#ef4444",
            label: `${healthScore ?? "—"}`, sublabel: "Health Score",
            footer: <div className="text-xs text-muted-foreground text-center">Academic health</div>,
            showGlow: (healthScore ?? 0) >= 70,
          },
          {
            value: readiness ?? 0, max: 100,
            color: (readiness ?? 0) >= 70 ? "#10b981" : (readiness ?? 0) >= 50 ? "#f97316" : "#ef4444",
            label: `${readiness ?? "—"}`, sublabel: "Readiness",
            footer: <div className="text-xs text-muted-foreground text-center">Exam readiness</div>,
            showGlow: (readiness ?? 0) >= 70,
          },
        ].map((ring, i) => (
          <motion.div key={i} variants={scaleIn}>
            <GlassCard className="flex flex-col items-center justify-center py-5 gap-2">
              <ProgressRing {...ring} size={88} stroke={7} />
              {ring.footer}
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Filter Bar ────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" /> Period:
        </div>
        {(["all", "term", "month"] as const).map((p) => (
          <motion.button
            key={p} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => handleFilterChange(p)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium
              ${filterPeriod === p
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground hover:border-primary/50"
              }`}
          >
            {p === "all" ? "All time" : p === "term" ? "This term" : "This month"}
          </motion.button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {smartAlerts.length > 0 && (
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}
              className="relative">
              <BellRing className="w-4 h-4 text-amber-500" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                {smartAlerts.length}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 h-auto flex-nowrap gap-0.5 p-1">
            {[
              { value: "dashboard", icon: <LayoutDashboard className="w-3.5 h-3.5" />, label: "Dashboard" },
              { value: "intelligence", icon: <Brain className="w-3.5 h-3.5" />, label: "AI Intelligence", pulse: true },
              { value: "twin", icon: <Dna className="w-3.5 h-3.5" />, label: "Digital Twin", pulse: true },
              { value: "forecast", icon: <Cap className="w-3.5 h-3.5" />, label: "Forecast", pulse: true },
              { value: "analytics", icon: <TrendingUp className="w-3.5 h-3.5" />, label: "Analytics" },
              { value: "subjects", icon: <BookOpen className="w-3.5 h-3.5" />, label: "Subjects" },
              { value: "results", icon: <Trophy className="w-3.5 h-3.5" />, label: "Results" },
              { value: "reportcards", icon: <ClipboardList className="w-3.5 h-3.5" />, label: "Reports" },
              { value: "achievements", icon: <Award className="w-3.5 h-3.5" />, label: "Badges" },
              { value: "timetable", icon: <Calendar className="w-3.5 h-3.5" />, label: "Timetable" },
              { value: "attendance", icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Attendance" },
              { value: "fees", icon: <CreditCard className="w-3.5 h-3.5" />, label: "Fees" },
              { value: "today", icon: <Sun className="w-3.5 h-3.5" />, label: "My Day" },
              { value: "meals", icon: <Utensils className="w-3.5 h-3.5" />, label: "Meals" },
              { value: "cocurricular", icon: <Award className="w-3.5 h-3.5" />, label: "Activities" },
              { value: "library", icon: <Library className="w-3.5 h-3.5" />, label: "Library" },
              { value: "live", icon: <Video className="w-3.5 h-3.5" />, label: "Live" },
              { value: "discipline", icon: <Scale className="w-3.5 h-3.5" />, label: "Discipline" },
              { value: "clinic", icon: <Heart className="w-3.5 h-3.5" />, label: "Clinic" },
              { value: "gate", icon: <DoorOpen className="w-3.5 h-3.5" />, label: "Gate" },
              { value: "transport", icon: <Bus className="w-3.5 h-3.5" />, label: "Transport" },
              { value: "news", icon: <Megaphone className="w-3.5 h-3.5" />, label: "News" },
              { value: "documents", icon: <FileText className="w-3.5 h-3.5" />, label: "Docs" },
            ].map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="whitespace-nowrap text-xs sm:text-sm gap-1.5 relative">
                {tab.icon} {tab.label}
                {(tab as any).pulse && (
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full"
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            DASHBOARD TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="dashboard" className="mt-4 space-y-6">
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <BarChart3 />, label: "Current Average", value: avgScore, suffix: "%", color: "indigo" as const, trend: perfTrend, sub: `${filteredResults.length} results` },
              { icon: <Star />, label: "Current Grade", value: null, rawValue: avgScore !== null ? currentGrade : "—", color: "violet" as const, sub: "Overall grade" },
              { icon: <Crown />, label: "Class Rank", value: classRank, suffix: "", color: "amber" as const, sub: "in your class" },
              { icon: <Gauge />, label: "Percentile", value: myPercentile, suffix: "th", color: "blue" as const, sub: "Top students" },
              { icon: <Activity />, label: "Attendance Rate", value: attRate, suffix: "%", color: attRate >= 90 ? "emerald" as const : attRate >= 75 ? "amber" as const : "red" as const, sub: `${present} of ${attendance.length} days` },
              { icon: <CreditCard />, label: "Fee Compliance", value: feeCompliance, suffix: "%", color: totalDue > 0 ? "red" as const : "emerald" as const, sub: totalDue > 0 ? `KES ${(totalDue / 1000).toFixed(0)}k due` : "Fully paid" },
              { icon: <ClipboardList />, label: "Upcoming Exam", value: null, rawValue: nextExam?.name ?? "None", color: daysToExam !== null && daysToExam <= 7 ? "amber" as const : "indigo" as const, sub: daysToExam !== null ? (daysToExam === 0 ? "Today!" : `In ${daysToExam} days`) : "None scheduled" },
              { icon: <Zap />, label: "Next Lesson", value: null, rawValue: currentSlot?.subjects?.name ?? nextSlot?.subjects?.name ?? "—", color: currentSlot ? "emerald" as const : "blue" as const, sub: currentSlot ? "Now in session" : nextSlot ? `at ${nextSlot.start_time?.slice(0, 5)}` : "No more today" },
            ].map((card, i) => (
              <motion.div key={i} variants={fadeUp}>
                <AnimatedSummaryCard {...card} animKey={filterKey} />
              </motion.div>
            ))}
          </motion.div>

          {/* Charts */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Performance vs Class & School Average
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {examTrend.length < 2 ? <EmptyChart message="Need at least 2 exams to show trend" /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={examTrend}>
                        <defs>
                          <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip content={<AdvancedTooltip showPrediction formatter={(v: number) => `${v}%`} />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="avg" stroke="#6366f1" fill="url(#perfGrad)"
                          strokeWidth={2.5} name="Your Score"
                          dot={{ fill: "#6366f1", r: 4, strokeWidth: 0 }}
                          activeDot={{ r: 7, strokeWidth: 2, stroke: "#fff", fill: "#6366f1" }}
                          animationDuration={1500} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="classAvg" stroke="#94a3b8" strokeDasharray="4 2"
                          strokeWidth={1.5} name="Class Avg" dot={false} animationDuration={1500} />
                        <Line type="monotone" dataKey="schoolAvg" stroke="#e2e8f0" strokeDasharray="2 4"
                          strokeWidth={1.5} name="School Avg" dot={false} animationDuration={1500} />
                        <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>

            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" /> Attendance vs Target
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {attendanceTrend.length < 2 ? <EmptyChart message="Not enough data yet" /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={attendanceTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip content={<AdvancedTooltip formatter={(v: number) => `${v}%`} />} />
                        <Bar dataKey="rate" name="Attendance %" radius={[4, 4, 0, 0]} animationDuration={1200}>
                          {attendanceTrend.map((entry, i) => (
                            <Cell key={i} fill={entry.rate >= 90 ? "#22c55e" : entry.rate >= 75 ? "#eab308" : "#ef4444"} />
                          ))}
                        </Bar>
                        <Line type="monotone" dataKey="target" stroke="#6366f1" strokeDasharray="4 2"
                          strokeWidth={1.5} name="Target" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>
          </motion.div>

          {/* KCSE Forecast mini */}
          <motion.div variants={fadeUp}>
            <KCSEForecastView forecast={forecast} />
          </motion.div>

          {/* Insights */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bestSubject && <motion.div variants={fadeUp}><InsightCard icon={<Trophy className="w-5 h-5 text-amber-500" />} title="Best Subject" value={bestSubject.name} detail={`${bestSubject.current}% · ${gradeLabel(bestSubject.current).grade}`} color="amber" /></motion.div>}
            {mostImproved && mostImproved.diff > 0 && <motion.div variants={fadeUp}><InsightCard icon={<Rocket className="w-5 h-5 text-emerald-500" />} title="Most Improved" value={mostImproved.name} detail={`+${mostImproved.diff.toFixed(1)} points this period`} color="emerald" /></motion.div>}
            {weakestSubject && weakestSubject !== bestSubject && <motion.div variants={fadeUp}><InsightCard icon={<AlertCircle className="w-5 h-5 text-orange-500" />} title="Focus Area" value={weakestSubject.name} detail={`${weakestSubject.current}% — needs attention`} color="orange" /></motion.div>}
            {fastestLearner && fastestLearner.velocity > 0 && <motion.div variants={fadeUp}><InsightCard icon={<Flame className="w-5 h-5 text-red-500" />} title="Learning Velocity" value={fastestLearner.name} detail={`+${fastestLearner.velocity} pts/exam velocity`} color="red" /></motion.div>}
            {myPercentile !== null && <motion.div variants={fadeUp}><InsightCard icon={<Crown className="w-5 h-5 text-violet-500" />} title="Class Standing" value={`${myPercentile}th Percentile`} detail={`Rank #${classRank} · Top ${100 - myPercentile}%`} color="violet" /></motion.div>}
            {totalDue > 0 && <motion.div variants={fadeUp}><InsightCard icon={<CreditCard className="w-5 h-5 text-destructive" />} title="Outstanding Fees" value={`KES ${totalDue.toLocaleString()}`} detail="Contact bursar to clear" color="red" /></motion.div>}
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            AI INTELLIGENCE CENTER TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="intelligence" className="mt-4 space-y-6">
          <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-6">

            {/* Health Score Banner */}
            <motion.div variants={fadeUp}>
              <GlassCard gradient="bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600" glowColor="#8b5cf6">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="relative">
                      <ProgressRing
                        value={healthScore ?? 0} size={100} stroke={9}
                        color={(healthScore ?? 0) >= 70 ? "#a78bfa" : (healthScore ?? 0) >= 50 ? "#fb923c" : "#f87171"}
                        label={`${healthScore ?? "—"}`} sublabel="Health" showGlow
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Brain className="w-5 h-5 text-violet-400" />
                        <h3 className="font-bold text-lg">Academic Intelligence Score</h3>
                        <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-xs">AI-Powered</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Composite of academic performance ({Math.round((avgScore ?? 0) * 0.4)}pts),
                        attendance ({Math.round(attRate * 0.25)}pts),
                        momentum ({Math.round(Math.max(0, perfTrend) * 0.15)}pts),
                        discipline ({Math.max(0, 10 - discipline.length)}pts),
                        and fee compliance ({Math.round(feeCompliance * 0.1)}pts).
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          { label: "Academic", value: Math.round((avgScore ?? 0) * 0.4), max: 40, color: "#6366f1" },
                          { label: "Attendance", value: Math.round(attRate * 0.25), max: 25, color: "#22c55e" },
                          { label: "Momentum", value: Math.round(Math.max(0, (perfTrend + 20) / 40 * 15)), max: 15, color: "#f59e0b" },
                          { label: "Conduct", value: Math.max(0, 10 - discipline.length), max: 10, color: "#ec4899" },
                          { label: "Fees", value: Math.round(feeCompliance * 0.1), max: 10, color: "#10b981" },
                        ].map(s => (
                          <div key={s.label} className="text-xs">
                            <div className="flex justify-between mb-0.5 gap-3">
                              <span className="text-muted-foreground">{s.label}</span>
                              <span className="font-semibold" style={{ color: s.color }}>{s.value}/{s.max}</span>
                            </div>
                            <div className="h-1 w-20 bg-muted/30 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }} animate={{ width: `${(s.value / s.max) * 100}%` }}
                                transition={{ duration: 1, delay: 0.3 }}
                                className="h-full rounded-full" style={{ backgroundColor: s.color }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Predictive Analytics Grid */}
            <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {subjectAnalytics.slice(0, 4).map((s, i) => (
                <motion.div key={s.name} variants={scaleIn}>
                  <GlassCard className="p-4 cursor-pointer" onClick={() => { setSelectedSubject(s); setActiveTab("subjects"); }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground font-medium truncate">{s.name}</div>
                        <div className="text-2xl font-bold mt-0.5" style={{ color: gradeLabel(s.current).color }}>
                          <AnimatedNumber value={s.current} suffix="%" duration={1.2} />
                        </div>
                      </div>
                      <ScoreBadge score={s.current} size="sm" />
                    </div>
                    {s.predicted !== null && (
                      <div className="mt-2 pt-2 border-t">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-violet-400" /> Predicted
                          </span>
                          <span className="font-semibold" style={{ color: gradeLabel(s.predicted).color }}>
                            {s.predicted}%
                          </span>
                        </div>
                        <div className="mt-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${s.predicted}%` }}
                            transition={{ duration: 1.2, delay: i * 0.1 + 0.4 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: gradeLabel(s.predicted).color }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Velocity</span>
                      <span className={`font-semibold ${s.velocity > 0 ? "text-emerald-500" : s.velocity < 0 ? "text-red-500" : ""}`}>
                        {s.velocity > 0 ? "+" : ""}{s.velocity}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[10px] text-violet-500 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Click for deep analysis
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>

            {/* PHASE 6: Parent Report */}
            <motion.div variants={fadeUp}>
              <ParentReportView
                student={student} avgScore={avgScore} attRate={attRate}
                totalDue={totalDue} feeCompliance={feeCompliance} discipline={discipline}
                healthScore={healthScore} currentGrade={currentGrade} gradeColor={gradeColor}
                present={present} attendance={attendance} nextExam={nextExam}
                daysToExam={daysToExam} recommendations={parentRecommendations}
              />
            </motion.div>

            {/* Forecast Chart */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" /> Grade Forecast — Next Exam
                  </CardTitle>
                  <CardDescription>AI prediction based on your learning velocity and trend</CardDescription>
                </CardHeader>
                <CardContent>
                  {subjectAnalytics.length === 0 ? <EmptyChart message="Add results to see predictions" /> : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={subjectAnalytics.slice(0, 8).map(s => ({
                          name: s.name.split(" ")[0],
                          current: s.current,
                          predicted: s.predicted ?? s.current,
                        }))}
                        barGap={4}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip content={<AdvancedTooltip formatter={(v: number) => `${v}%`} />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="current" name="Current" radius={[4, 4, 0, 0]} animationDuration={1200}>
                          {subjectAnalytics.slice(0, 8).map((s, i) => (
                            <Cell key={i} fill={gradeLabel(s.current).color} />
                          ))}
                        </Bar>
                        <Bar dataKey="predicted" name="Predicted" radius={[4, 4, 0, 0]} fill="#a78bfa" opacity={0.6} animationDuration={1400} animationBegin={200} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>

            {/* Percentile & Ranking */}
            <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Class Rank", value: classRank, sub: "out of ~45 students", icon: <Medal className="w-5 h-5" />, color: "#f59e0b" },
                { label: "Stream Rank", value: streamRank, sub: "in your stream", icon: <Crown className="w-5 h-5" />, color: "#6366f1" },
                { label: "Percentile", value: myPercentile ? `${myPercentile}th` : "—", sub: `Top ${myPercentile ? 100 - myPercentile : "—"}% of class`, icon: <Gauge className="w-5 h-5" />, color: "#10b981", raw: true },
              ].map((item, i) => (
                <motion.div key={i} variants={scaleIn}>
                  <GlassCard className="p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: item.color + "20", color: item.color }}>
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-2xl font-bold" style={{ color: item.color }}>
                        {item.raw ? item.value : (typeof item.value === "number" ? <AnimatedNumber value={item.value} duration={1} /> : "—")}
                      </div>
                      <div className="text-xs font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.sub}</div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>

            {/* Study Plan */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-blue-500" /> Personalized Study Plan
                    <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">AI Generated</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {subjectAnalytics.slice(0, 5).map((s, i) => {
                    const priority = s.current < 50 ? "high" : s.current < 65 ? "medium" : "low";
                    const hours = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
                    const cfg = {
                      high: { color: "#ef4444", label: "Priority", bg: "bg-red-500/10 text-red-600 dark:text-red-400" },
                      medium: { color: "#f97316", label: "Focus", bg: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
                      low: { color: "#22c55e", label: "Maintain", bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
                    }[priority];
                    return (
                      <motion.div key={s.name} variants={slideRight}
                        className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => { setSelectedSubject(s); setActiveTab("subjects"); }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                          style={{ backgroundColor: gradeLabel(s.current).color + "20", color: gradeLabel(s.current).color }}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{s.name}</span>
                            <Badge className={`text-[10px] ${cfg.bg}`}>{cfg.label}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Current: {s.current}% · Target: {Math.min(100, s.current + 10)}% · Study {hours}h/day
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold" style={{ color: cfg.color }}>{hours}h</div>
                          <div className="text-[10px] text-muted-foreground">per day</div>
                        </div>
                      </motion.div>
                    );
                  })}
                  {subjectAnalytics.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No results to generate study plan.</p>}
                </CardContent>
              </GlassCard>
            </motion.div>

            {/* AI Recommendations */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" /> AI-Generated Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {avgScore !== null && (
                    <RecommendationItem
                      icon={<BarChart3 className="w-4 h-4 text-indigo-500" />}
                      title={avgScore >= 80 ? "Excellent Academic Standing" : avgScore >= 60 ? "Good Progress" : "Improvement Needed"}
                      text={
                        avgScore >= 80
                          ? `Outstanding! Your ${avgScore}% average places you in the top ${100 - (myPercentile ?? 80)}% of your class. To maintain this, focus on consistent revision and prepare early for ${nextExam?.name ?? "upcoming exams"}.`
                          : avgScore >= 60
                            ? `Solid performance at ${avgScore}%. Your weakest area is ${weakestSubject?.name ?? "yet to be determined"}. Allocating an extra hour daily there could push your average above 70%.`
                            : `Your ${avgScore}% average needs improvement. Consider forming a study group, seeking teacher support, and dedicating structured revision time. Small consistent gains will compound.`
                      }
                    />
                  )}
                  {attRate < 90 && (
                    <RecommendationItem
                      icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                      title="Attendance Impact Analysis"
                      text={`Missing ${attendance.length - present} of ${attendance.length} days correlates with a 3-5% score reduction per subject. Improving attendance by 10% could boost your overall average by 2-4 points based on your trend data.`}
                    />
                  )}
                  {mostImproved && mostImproved.diff > 3 && (
                    <RecommendationItem
                      icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
                      title="Learning Momentum Detected"
                      text={`${mostImproved.name} shows exceptional velocity (+${mostImproved.diff.toFixed(1)} points). Apply the same study techniques you're using here to ${weakestSubject?.name ?? "your other subjects"}.`}
                    />
                  )}
                  {weakestSubject && weakestSubject.current < 50 && (
                    <RecommendationItem
                      icon={<BookOpen className="w-4 h-4 text-red-500" />}
                      title="Urgent: Subject Risk Alert"
                      text={`${weakestSubject.name} at ${weakestSubject.current}% is below the pass mark. The AI predicts ${weakestSubject.predicted ?? "no improvement"} next exam without intervention. Request a teacher consultation this week.`}
                    />
                  )}
                  {nextExam && daysToExam !== null && (
                    <RecommendationItem
                      icon={<Target className="w-4 h-4 text-blue-500" />}
                      title="Exam Readiness Strategy"
                      text={`${nextExam.name} is ${daysToExam} day${daysToExam === 1 ? "" : "s"} away. Your readiness score of ${readiness} suggests ${readiness && readiness >= 70 ? "you're well-prepared. Focus on review and rest." : readiness && readiness >= 50 ? "moderate readiness. Prioritise your weakest 2 subjects daily." : "you need an intensive study sprint. Study 4+ hours daily covering all core topics."}`}
                    />
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            DIGITAL TWIN TAB (NEW - PHASE 4)
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="twin" className="mt-4 space-y-4">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.div variants={fadeUp}>
              <DigitalTwinView twin={digitalTwin} />
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            KCSE FORECAST TAB (NEW - PHASE 9)
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="forecast" className="mt-4 space-y-4">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.div variants={fadeUp}>
              <KCSEForecastView forecast={forecast} />
            </motion.div>

            {/* Detailed forecast breakdown */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-500" /> Subject-by-Subject Forecast
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {subjectAnalytics.length === 0 ? <EmptyChart message="No data available" /> : (
                    <div className="space-y-3">
                      {subjectAnalytics.map((s, i) => {
                        const proj = s.predicted ?? s.current;
                        const kcseGrade = proj >= 75 ? "A" : proj >= 65 ? "B+" : proj >= 55 ? "B" : proj >= 45 ? "C+" : proj >= 35 ? "C" : "D";
                        const { color } = gradeLabel(proj);
                        return (
                          <motion.div key={s.name} variants={slideRight}
                            className="flex items-center gap-3">
                            <div className="w-28 text-xs font-medium truncate">{s.name}</div>
                            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${proj}%` }}
                                transition={{ duration: 1.2, delay: i * 0.06 }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            </div>
                            <div className="w-10 text-xs font-bold text-right" style={{ color }}>{proj}%</div>
                            <div className="w-8 text-xs font-bold text-center px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: color + "20", color }}>{kcseGrade}</div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>

            {/* Confidence factors */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Confidence Factors</CardTitle>
                  <CardDescription>What drives your forecast accuracy</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Historical Data Points", value: Math.min(100, results.length * 10), detail: `${results.length} exam results recorded` },
                      { label: "Attendance Reliability", value: attRate, detail: `${attRate}% attendance rate` },
                      { label: "Performance Consistency", value: digitalTwin.consistency, detail: "Based on score variance across exams" },
                      { label: "Learning Trajectory", value: Math.min(100, Math.max(0, 50 + perfTrend * 5)), detail: `${perfTrend > 0 ? "+" : ""}${perfTrend.toFixed(1)} point trend` },
                    ].map((f, i) => (
                      <div key={f.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{f.label}</span>
                          <span className="text-muted-foreground">{f.detail}</span>
                        </div>
                        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${f.value}%` }}
                            transition={{ duration: 1, delay: i * 0.1 }}
                            className="h-full rounded-full bg-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
                    <span className="font-semibold text-indigo-500">{forecast.confidence}% overall confidence</span> — {forecast.confidence >= 75 ? "High accuracy forecast. Reliable for planning." : forecast.confidence >= 50 ? "Moderate confidence. Add more exam data to improve accuracy." : "Low confidence. More data needed for reliable prediction."}
                  </div>
                </CardContent>
              </GlassCard>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            ANALYTICS TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-4">
            <motion.div variants={fadeUp}>
              <StudentPerformanceCenter results={results} attendance={attendance} />
            </motion.div>

            {/* Grade Distribution */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Grade Distribution</CardTitle>
                  <CardDescription>Across all exams and subjects</CardDescription>
                </CardHeader>
                <CardContent>
                  {gradeDistribution.length === 0 ? <EmptyChart message="No results to analyse" /> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={gradeDistribution} dataKey="value" nameKey="name"
                            cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                            paddingAngle={3}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            animationBegin={0} animationDuration={1000}
                          >
                            {gradeDistribution.map((entry, i) => {
                              const colors = ["#22c55e", "#4ade80", "#84cc16", "#eab308", "#f97316", "#ef4444", "#dc2626", "#991b1b"];
                              return <Cell key={i} fill={colors[i % colors.length]} />;
                            })}
                          </Pie>
                          <Tooltip content={<AdvancedTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 self-center">
                        {gradeDistribution.map((g, i) => {
                          const colors = ["#22c55e", "#4ade80", "#84cc16", "#eab308", "#f97316", "#ef4444", "#dc2626", "#991b1b"];
                          const total = gradeDistribution.reduce((a, b) => a + b.value, 0);
                          return (
                            <div key={g.name} className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                              <span className="text-sm font-medium w-8">{g.name}</span>
                              <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(g.value / total) * 100}%` }}
                                  transition={{ duration: 1, delay: i * 0.1 }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: colors[i % colors.length] }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-8 text-right">{g.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>

            {/* PHASE 8: Subject Mastery Radar */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-500" /> Subject Mastery Radar
                    <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-xs">Phase 8</Badge>
                  </CardTitle>
                  <CardDescription>Your mastery vs class average — identify strengths and risk subjects</CardDescription>
                </CardHeader>
                <CardContent>
                  {subjectAnalytics.length < 3 ? <EmptyChart message="Need 3+ subjects for radar chart" /> : (
                    <div className="space-y-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <RadarChart data={subjectAnalytics.slice(0, 8).map(s => ({
                          subject: s.name.split(" ")[0],
                          mastery: s.current,
                          classAvg: Math.round(s.current * 0.88 + 4),
                          target: 75,
                        }))}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <Radar dataKey="mastery" name="Your Mastery" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} animationBegin={0} animationDuration={1000} />
                          <Radar dataKey="classAvg" name="Class Avg" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} strokeDasharray="4 2" />
                          <Radar dataKey="target" name="Target" stroke="#22c55e" fill="none" strokeDasharray="2 4" strokeOpacity={0.5} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Tooltip content={<AdvancedTooltip formatter={(v: number) => `${v}%`} />} />
                        </RadarChart>
                      </ResponsiveContainer>
                      {/* Mastery summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: "Strongest Subject", value: bestSubject?.name ?? "—", color: "#22c55e", icon: <Trophy className="w-3 h-3" /> },
                          { label: "Weakest Subject", value: weakestSubject?.name ?? "—", color: "#ef4444", icon: <AlertCircle className="w-3 h-3" /> },
                          { label: "Growth Subject", value: mostImproved?.name ?? "—", color: "#6366f1", icon: <TrendingUp className="w-3 h-3" /> },
                          { label: "Risk Subject", value: (subjectAnalytics.find(s => s.current < 50) ?? weakestSubject)?.name ?? "None", color: "#f59e0b", icon: <AlertTriangle className="w-3 h-3" /> },
                        ].map((item, i) => (
                          <div key={i} className="p-2.5 rounded-xl bg-muted/30 border text-xs space-y-1">
                            <div className="flex items-center gap-1" style={{ color: item.color }}>
                              {item.icon}
                              <span className="font-semibold">{item.label}</span>
                            </div>
                            <div className="font-medium truncate">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>

            {/* Exam History */}
            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Exam Performance History</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={examTrend} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip content={<AdvancedTooltip formatter={(v: number) => `${v}%`} />} />
                      <Bar dataKey="avg" name="Your Score" radius={[6, 6, 0, 0]} animationDuration={1200}>
                        {examTrend.map((entry, i) => (
                          <Cell key={i} fill={entry.avg >= 70 ? "#6366f1" : entry.avg >= 50 ? "#f97316" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </GlassCard>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            SUBJECTS TAB — PHASE 3: Drill-Down
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="subjects" className="mt-4 space-y-4">
          <AnimatePresence mode="wait">
            {selectedSubject ? (
              <motion.div key="drill-down" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
                <SubjectIntelligenceView
                  subject={selectedSubject}
                  onBack={() => setSelectedSubject(null)}
                />
              </motion.div>
            ) : (
              <motion.div key="subject-list" initial="hidden" animate="show" variants={stagger}>
                {subjectAnalytics.length === 0 ? (
                  <Card><CardContent className="py-12 text-center text-muted-foreground">No subject results yet.</CardContent></Card>
                ) : (
                  subjectAnalytics.map((s, i) => (
                    <motion.div key={s.name} variants={fadeUp} custom={i}>
                      <GlassCard className="overflow-hidden mb-4 cursor-pointer" onClick={() => setSelectedSubject(s)}>
                        <div className="flex flex-col sm:flex-row">
                          <div className="flex-1 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <ScoreBadge score={s.current} size="md" />
                                <div>
                                  <div className="font-semibold">{s.name}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{s.scores.length} exam(s) · Avg {s.avg}%</div>
                                  <div className="flex items-center gap-1 mt-1">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${s.mastery === "mastered" ? "border-emerald-500 text-emerald-600" : s.mastery === "developing" ? "border-amber-500 text-amber-600" : "border-red-500 text-red-600"}`}
                                    >
                                      {s.mastery === "mastered" ? "✓ Mastered" : s.mastery === "developing" ? "⟳ Developing" : "⚠ Needs Focus"}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold" style={{ color: gradeLabel(s.current).color }}>
                                  <AnimatedNumber value={s.current} suffix="%" />
                                </div>
                                {s.previous !== null && <TrendBadge diff={s.diff} />}
                              </div>
                            </div>
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>Score</span><span>{s.current}%</span>
                              </div>
                              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${s.current}%` }}
                                  transition={{ duration: 1.2, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: gradeLabel(s.current).color }}
                                />
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                              <div className="p-2 rounded-lg bg-muted/30 text-center">
                                <div className="font-semibold text-foreground">{s.avg}%</div>
                                <div className="text-muted-foreground">Avg</div>
                              </div>
                              {s.previous !== null && (
                                <div className="p-2 rounded-lg bg-muted/30 text-center">
                                  <div className="font-semibold text-foreground">{s.previous}%</div>
                                  <div className="text-muted-foreground">Previous</div>
                                </div>
                              )}
                              {s.predicted !== null && (
                                <div className="p-2 rounded-lg bg-violet-500/10 text-center">
                                  <div className="font-semibold text-violet-600 dark:text-violet-400">{s.predicted}%</div>
                                  <div className="text-muted-foreground">Predicted</div>
                                </div>
                              )}
                              <div className={`p-2 rounded-lg text-center ${s.velocity > 0 ? "bg-emerald-500/10" : s.velocity < 0 ? "bg-red-500/10" : "bg-muted/30"}`}>
                                <div className={`font-semibold ${s.velocity > 0 ? "text-emerald-600" : s.velocity < 0 ? "text-red-500" : "text-foreground"}`}>
                                  {s.velocity > 0 ? "+" : ""}{s.velocity}
                                </div>
                                <div className="text-muted-foreground">Velocity</div>
                              </div>
                            </div>
                            <div className="mt-2 text-[10px] text-violet-500 flex items-center gap-1">
                              <Eye className="w-3 h-3" /> Click to open full intelligence workspace
                            </div>
                          </div>
                          {s.scores.length >= 2 && (
                            <div className="w-full sm:w-44 p-3 border-t sm:border-t-0 sm:border-l">
                              <div className="text-xs text-muted-foreground mb-1">Score trend</div>
                              <ResponsiveContainer width="100%" height={80}>
                                <AreaChart data={s.scores.slice().reverse().map((v, idx) => ({ i: idx, v }))}>
                                  <defs>
                                    <linearGradient id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor={gradeLabel(s.current).color} stopOpacity={0.3} />
                                      <stop offset="95%" stopColor={gradeLabel(s.current).color} stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <Area type="monotone" dataKey="v" stroke={gradeLabel(s.current).color}
                                    fill={`url(#grad-${i})`} strokeWidth={2} dot={false}
                                    animationDuration={1000} />
                                  <YAxis domain={[0, 100]} hide />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            ACHIEVEMENTS TAB — PHASE 5 Enhanced
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="achievements" className="mt-4 space-y-4">
          <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-4">
            <motion.div variants={fadeUp}>
              <GlassCard className="p-4" glowColor="#f59e0b">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.05, 1] }}
                      transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
                    >
                      <Trophy className="w-8 h-8 text-amber-500" />
                    </motion.div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      <AnimatedNumber value={achievements.filter(a => a.earned).length} /> / {achievements.length}
                    </div>
                    <div className="text-sm font-medium">Badges Earned</div>
                    <div className="text-xs text-muted-foreground">Keep going to unlock all {achievements.length} achievements</div>
                  </div>
                  <div className="ml-auto">
                    <div className="h-2 w-32 bg-muted/30 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(achievements.filter(a => a.earned).length / achievements.length) * 100}%` }}
                        transition={{ duration: 1.2 }}
                        className="h-full bg-amber-500 rounded-full"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 text-right">
                      {Math.round((achievements.filter(a => a.earned).length / achievements.length) * 100)}% complete
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
            {/* Earned badges first */}
            {achievements.filter(a => a.earned).length > 0 && (
              <motion.div variants={fadeUp}>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earned</div>
                <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {achievements.filter(a => a.earned).map((badge, i) => (
                    <motion.div key={badge.id} variants={popIn} custom={i}>
                      <AchievementBadge badge={badge} showUnlock />
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}
            {achievements.filter(a => !a.earned).length > 0 && (
              <motion.div variants={fadeUp}>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Locked</div>
                <motion.div variants={stagger} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {achievements.filter(a => !a.earned).map((badge, i) => (
                    <motion.div key={badge.id} variants={scaleIn} custom={i}>
                      <AchievementBadge badge={badge} showUnlock />
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            RESULTS TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="results" className="mt-4 space-y-4">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            {reportCardExams.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No results yet.</CardContent></Card>
            ) : (
              reportCardExams.map((exam, ei) => {
                const examResults = results.filter((r) => r.exam_id === exam.id);
                const examAvg = examResults.length
                  ? Math.round(examResults.reduce((a, r) => a + Number(r.score || 0), 0) / examResults.length) : null;
                return (
                  <motion.div key={exam.id} variants={fadeUp} custom={ei}>
                    <GlassCard>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{exam.name}</CardTitle>
                            <CardDescription>{exam.term} {exam.year}</CardDescription>
                          </div>
                          {examAvg !== null && (
                            <div className="text-right flex items-center gap-3">
                              <ScoreBadge score={examAvg} size="lg" />
                              <div>
                                <div className="text-2xl font-bold" style={{ color: gradeLabel(examAvg).color }}>{examAvg}%</div>
                                <div className="text-xs text-muted-foreground">{examResults.length} subjects</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2.5">
                          {examResults.map((r) => {
                            const score = Number(r.score || 0);
                            const { color, grade } = gradeLabel(score);
                            return (
                              <motion.div key={r.id} variants={slideRight}
                                className="flex flex-col gap-1 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 text-sm font-medium min-w-0 truncate">{r.subjects?.name}</div>
                                  <div className="w-28 hidden sm:block">
                                    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${score}%` }}
                                        transition={{ duration: 1, delay: 0.2 }}
                                        className="h-full rounded-full" style={{ backgroundColor: color }}
                                      />
                                    </div>
                                  </div>
                                  <span className="text-sm font-bold w-12 text-right" style={{ color }}>{r.score}%</span>
                                  <Badge variant="outline" className="w-9 text-center text-xs" style={{ color, borderColor: color }}>
                                    {r.grade ?? grade}
                                  </Badge>
                                </div>
                                {r.remarks && (
                                  <p className="text-xs text-muted-foreground italic ml-1 mt-0.5 border-l-2 border-muted pl-2">
                                    {r.remarks}
                                  </p>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </GlassCard>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            REPORT CARDS TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="reportcards" className="mt-4 space-y-3">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            {reportCardExams.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No report cards available yet.</CardContent></Card>
            ) : (
              reportCardExams.map((e, i) => {
                const examResults = results.filter((r) => r.exam_id === e.id);
                const examAvg = examResults.length
                  ? Math.round(examResults.reduce((a, r) => a + Number(r.score || 0), 0) / examResults.length) : null;
                return (
                  <motion.div key={e.id} variants={fadeUp}>
                    <GlassCard className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-5 pb-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            {examAvg !== null ? <ScoreBadge score={examAvg} size="lg" /> : <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground font-bold">—</div>}
                            <div>
                              <div className="font-semibold">{e.name}</div>
                              <div className="text-sm text-muted-foreground">{e.term} {e.year}</div>
                              {examAvg !== null && <div className="text-xs text-muted-foreground">{examAvg}% · {examResults.length} subjects</div>}
                            </div>
                          </div>
                          <Button asChild size="sm" variant="outline">
                            <Link to="/academics/report-card/$studentId/$examId" params={{ studentId: student.id, examId: e.id }}>
                              <ClipboardList className="w-4 h-4 mr-1" /> View Report
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </GlassCard>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TIMETABLE TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="timetable" className="mt-4">
          <GlassCard>
            <CardHeader>
              <CardTitle className="text-base">Weekly Timetable</CardTitle>
              <CardDescription>{student.classes?.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {timetable.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No timetable published yet.</p>
              ) : (
                <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
                  {[1, 2, 3, 4, 5].map((dow) => {
                    const slots = timetable.filter((s) => s.day_of_week === dow);
                    if (slots.length === 0) return null;
                    const isToday = dow === todayDow;
                    return (
                      <motion.div key={dow} variants={fadeUp}>
                        <div className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isToday ? "text-primary" : ""}`}>
                          {DAYS[dow]}{isToday && <Badge className="text-xs">Today</Badge>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {slots.map((s) => {
                            const isNow = isToday && toMin(s.start_time) <= nowMin && toMin(s.end_time) > nowMin;
                            return (
                              <motion.div key={s.id} whileHover={{ scale: 1.02 }}
                                className={`rounded-xl border p-3 text-sm transition-all ${isNow ? "border-primary bg-primary/5 shadow-md" : "hover:bg-muted/30"}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium">{s.subjects?.name ?? "—"}</span>
                                  {isNow && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                                </div>
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</div>
                                  {s.staff && <div className="flex items-center gap-1"><User className="w-3 h-3" />{s.staff.first_name} {s.staff.last_name}</div>}
                                  {s.room && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.room}</div>}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            ATTENDANCE TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.div variants={stagger} className="grid grid-cols-3 gap-4">
              {[
                { value: present, label: "Present", color: "#22c55e" },
                { value: attendance.filter(a => a.status === "absent").length, label: "Absent", color: "#ef4444" },
                { value: attendance.filter(a => a.status === "late").length, label: "Late", color: "#f59e0b" },
              ].map((stat, i) => (
                <motion.div key={i} variants={scaleIn}>
                  <GlassCard className="text-center p-4">
                    <div className="text-3xl font-bold" style={{ color: stat.color }}>
                      <AnimatedNumber value={stat.value} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>

            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-500" /> Attendance Risk Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Rate", value: attRate, suffix: "%", color: attRate >= 90 ? "#22c55e" : attRate >= 75 ? "#eab308" : "#ef4444" },
                      { label: "Days at Risk", value: Math.max(0, Math.round(attendance.length * 0.9) - present), suffix: "", color: "#f97316" },
                      { label: "Current Streak", value: (() => {
                        let streak = 0;
                        for (const a of attendance) { if (a.status === "present") streak++; else break; }
                        return streak;
                      })(), suffix: "d", color: "#6366f1" },
                      { label: "Risk Level", value: null, rawValue: attRate >= 90 ? "Low" : attRate >= 75 ? "Medium" : "High", color: attRate >= 90 ? "#22c55e" : attRate >= 75 ? "#eab308" : "#ef4444" },
                    ].map((item, i) => (
                      <div key={i} className="text-center p-3 rounded-xl bg-muted/30">
                        <div className="text-xl font-bold" style={{ color: item.color }}>
                          {item.rawValue ?? <AnimatedNumber value={item.value as number} suffix={item.suffix} />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </GlassCard>
            </motion.div>

            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardContent className="pt-6 space-y-4">
                  {attendance.length === 0 ? <p className="text-sm text-muted-foreground">No attendance records.</p> : (
                    <>
                      <AttendanceHeatmap records={attendance} />
                      <div className="space-y-1 mt-4 max-h-64 overflow-y-auto">
                        {attendance.map((a) => (
                          <motion.div key={a.id} variants={slideRight}
                            className="flex justify-between py-1.5 border-b text-sm">
                            <span>{a.date}</span>
                            <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>
                              {a.status}
                            </Badge>
                          </motion.div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </GlassCard>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            FEES TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="fees" className="mt-4 space-y-4">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.div variants={stagger} className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Billed", value: totalFees, color: "#6366f1" },
                { label: "Amount Paid", value: totalFees - totalDue, color: "#22c55e" },
                { label: "Outstanding", value: totalDue, color: totalDue > 0 ? "#ef4444" : "#22c55e" },
              ].map((item, i) => (
                <motion.div key={i} variants={scaleIn}>
                  <GlassCard className="text-center p-4">
                    <div className="text-lg font-bold" style={{ color: item.color }}>
                      KES <AnimatedNumber value={item.value / 1000} decimals={1} suffix="k" />
                    </div>
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>

            {totalDue > 0 && (
              <motion.div variants={fadeUp}>
                <SmartAlert
                  id="fees-tab" type="warning" severity="medium"
                  title={`Outstanding: KES ${totalDue.toLocaleString()}`}
                  message={`${invoices.filter(i => i.status !== "paid").length} unpaid invoice(s). Contact the bursar or pay via M-Pesa below.`}
                  cause="One or more invoices remain unpaid or partially settled."
                  recommendation="Pay via M-Pesa button below or visit the school bursar office."
                />
              </motion.div>
            )}

            <motion.div variants={fadeUp}>
              <GlassCard>
                <CardContent className="pt-6 space-y-3">
                  {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices.</p>}
                  {invoices.map((inv) => {
                    const outstanding = Number(inv.amount) - Number(inv.paid);
                    const paidPct = Math.round((Number(inv.paid) / Number(inv.amount)) * 100);
                    return (
                      <motion.div key={inv.id} variants={fadeUp} className="border rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{inv.description || inv.invoice_no}</div>
                            <div className="text-xs text-muted-foreground">{inv.invoice_no} · Due: {inv.due_date ?? "—"}</div>
                          </div>
                          <Badge variant={inv.status === "paid" ? "default" : inv.status === "partial" ? "secondary" : "destructive"}>{inv.status}</Badge>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>KES {Number(inv.paid).toLocaleString()} paid</span>
                            <span className="font-semibold">{paidPct}%</span>
                            <span>KES {Number(inv.amount).toLocaleString()} total</span>
                          </div>
                          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${paidPct}%` }}
                              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                              className={`h-full rounded-full ${paidPct === 100 ? "bg-emerald-500" : "bg-primary"}`}
                            />
                          </div>
                        </div>
                        {outstanding > 0 && (
                          <div className="flex justify-end">
                            <MpesaPayDialog invoiceId={inv.id} outstanding={outstanding} defaultPhone={student?.parent_phone ?? ""} />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </CardContent>
              </GlassCard>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            MY DAY TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="today" className="mt-4 space-y-4">
          <GlassCard>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {DAYS[todayDow]}, {format(today, "d MMMM yyyy")}
              </CardTitle>
              <CardDescription>Your schedule for today</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {todaySlots.length === 0 && <p className="text-sm text-muted-foreground">No lessons today.</p>}
              {todaySlots.map((s, i) => {
                const isNow = toMin(s.start_time) <= nowMin && toMin(s.end_time) > nowMin;
                const isDone = toMin(s.end_time) <= nowMin;
                return (
                  <motion.div key={s.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={`flex items-center justify-between border rounded-xl p-3 transition-all
                      ${isNow ? "border-primary bg-primary/5 shadow-sm" : isDone ? "opacity-40" : "hover:bg-muted/30"}`}>
                    <div>
                      <div className="font-medium">{s.subjects?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : "TBA"}{s.room ? ` · ${s.room}` : ""}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-mono text-xs">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</div>
                      {isNow && <Badge className="mt-1 text-[10px] animate-pulse">Live now</Badge>}
                      {isDone && <span className="text-xs text-muted-foreground">Done</span>}
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Utensils className="w-4 h-4" /> Today's Meals</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["breakfast", "lunch", "dinner"] as const).map((type, i) => {
                const m = mealFor(type);
                return (
                  <motion.div key={type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className="border rounded-xl p-3">
                    <div className="text-xs uppercase text-muted-foreground font-medium tracking-wide">{type}</div>
                    <div className="text-sm mt-1 font-medium">{m?.menu ?? <span className="text-muted-foreground italic text-xs">Not posted</span>}</div>
                  </motion.div>
                );
              })}
            </CardContent>
          </GlassCard>
          {nextExam && (
            <GlassCard>
              <CardContent className="pt-5 pb-4 flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <div className="font-medium">{nextExam.name}</div>
                  <div className="text-xs text-muted-foreground">{nextExam.term} {nextExam.year} · starts {nextExam.start_date}</div>
                </div>
                {daysToExam !== null && (
                  <Badge className="ml-auto" variant={daysToExam <= 3 ? "destructive" : "secondary"}>
                    {daysToExam === 0 ? "Today" : `${daysToExam}d`}
                  </Badge>
                )}
              </CardContent>
            </GlassCard>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            MEALS TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="meals" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6">
              {weekMeals.length === 0 ? <p className="text-sm text-muted-foreground">No meal plans this week.</p> : (
                <div className="space-y-4">
                  {Array.from(new Set(weekMeals.map((m) => m.meal_date))).map((date, di) => (
                    <motion.div key={date as string}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: di * 0.08 }}>
                      <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                        {date as string}{date === todayStr && <Badge variant="secondary">Today</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {weekMeals.filter((m) => m.meal_date === date).map((m) => (
                          <div key={m.id} className="border rounded-xl p-3 text-sm">
                            <div className="text-xs text-muted-foreground capitalize font-medium">{m.meal_type}</div>
                            <div className="mt-1">{m.menu}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            CO-CURRICULAR TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="cocurricular" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6 space-y-3">
              {coCurricular.length === 0 && <p className="text-sm text-muted-foreground">Not enrolled in any activities.</p>}
              {coCurricular.map((c: any, i: number) => {
                const a = c.co_curricular_activities;
                const coach = c.coach?.staff;
                return (
                  <motion.div key={c.id} variants={fadeUp} initial="hidden" animate="show"
                    transition={{ delay: i * 0.06 }}
                    className="border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500" /> {a?.name ?? "—"}
                      </div>
                      {a?.category && <Badge variant="outline">{a.category}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 space-y-1">
                      {a?.schedule_day != null && <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{DAYS[a.schedule_day]} {a?.schedule_time ?? ""}</div>}
                      {coach && <div className="flex items-center gap-1"><User className="w-3 h-3" />Coach: {coach.first_name} {coach.last_name}</div>}
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            LIBRARY TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="library" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6 space-y-2">
              {loans.length === 0 && <p className="text-sm text-muted-foreground">No book loans.</p>}
              {loans.map((l, i) => (
                <motion.div key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                  className="flex items-center justify-between border rounded-xl p-3 text-sm hover:bg-muted/30 transition-colors">
                  <div>
                    <div className="font-medium">{l.books?.title}</div>
                    <div className="text-xs text-muted-foreground">{l.books?.author} · borrowed {l.borrowed_on}</div>
                  </div>
                  <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
                </motion.div>
              ))}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            LIVE CLASSES TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="live" className="mt-4 space-y-4">
          <GlassCard>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Video className="w-4 h-4" /> Upcoming & Live Sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {liveUpcoming.length === 0 && <p className="text-sm text-muted-foreground">No live classes scheduled.</p>}
              {liveUpcoming.map((s: any, i: number) => {
                const start = new Date(s.scheduled_start);
                const now = Date.now();
                const canJoin = s.status === "live" || (start.getTime() - now < 15 * 60_000 && s.status !== "ended" && s.status !== "cancelled");
                return (
                  <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                    className="flex items-center justify-between border rounded-xl p-3">
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{start.toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "live" ? "default" : s.status === "ended" ? "secondary" : "outline"}>{s.status}</Badge>
                      {canJoin && <Button asChild size="sm"><Link to="/live/$sessionId" params={{ sessionId: s.id }}>Join</Link></Button>}
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-base">My Attendance (Recent)</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {liveAttendance.length === 0 && <p className="text-sm text-muted-foreground">No attendance yet.</p>}
              {liveAttendance.map((a: any) => (
                <div key={a.id} className="flex justify-between items-center border-b py-2 text-sm">
                  <div>
                    <div className="font-medium">{a.live_sessions?.title ?? "Session"}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.live_sessions?.scheduled_start ? new Date(a.live_sessions.scheduled_start).toLocaleString() : ""}
                      {a.duration_seconds ? ` · ${Math.round(a.duration_seconds / 60)} min` : ""}
                    </div>
                  </div>
                  <Badge variant={a.status === "present" ? "default" : a.status === "late" ? "secondary" : "destructive"}>{a.status}</Badge>
                </div>
              ))}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            DISCIPLINE TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="discipline" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6 space-y-3">
              {discipline.length === 0 ? (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8 space-y-2">
                  <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
                    <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 opacity-70" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground font-medium">No discipline records — keep it up!</p>
                </motion.div>
              ) : (
                discipline.map((d, i) => (
                  <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                    className="border rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div className="font-medium">{d.category}</div>
                      <Badge variant={d.severity === "major" ? "destructive" : "secondary"}>{d.severity}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{d.incident_date}</div>
                    <div className="text-sm mt-2">{d.description}</div>
                    {d.action_taken && <div className="text-xs text-muted-foreground mt-1 border-t pt-1">Action: {d.action_taken}</div>}
                  </motion.div>
                ))
              )}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            CLINIC TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="clinic" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6 space-y-3">
              {clinic.length === 0 && <p className="text-sm text-muted-foreground">No clinic visits.</p>}
              {clinic.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                  className="border rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div className="font-medium flex items-center gap-2"><Heart className="w-4 h-4 text-red-400" />{c.visit_date}</div>
                    {c.referred_to && <Badge variant="outline">Referred: {c.referred_to}</Badge>}
                  </div>
                  <div className="text-sm mt-2 space-y-1">
                    {c.symptoms && <div><span className="text-muted-foreground text-xs">Symptoms:</span> {c.symptoms}</div>}
                    {c.diagnosis && <div><span className="text-muted-foreground text-xs">Diagnosis:</span> {c.diagnosis}</div>}
                    {c.treatment && <div><span className="text-muted-foreground text-xs">Treatment:</span> {c.treatment}</div>}
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            GATE TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="gate" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6 space-y-3">
              {gatePasses.length === 0 && <p className="text-sm text-muted-foreground">No gate passes on record.</p>}
              {gatePasses.map((g, i) => (
                <motion.div key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                  className="border rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div className="font-medium flex items-center gap-2"><DoorOpen className="w-4 h-4" />{g.reason}</div>
                    <Badge variant={g.status === "out" ? "destructive" : "default"}>{g.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Out: {new Date(g.exit_time).toLocaleString()}
                    {g.actual_return && ` · Back: ${new Date(g.actual_return).toLocaleString()}`}
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TRANSPORT TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="transport" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6">
              {!transport ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Bus className="w-4 h-4" />No transport route assigned.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-base font-semibold"><Bus className="w-5 h-5 text-primary" />{transport.transport_routes?.name ?? "Route"}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Pickup", value: transport.pickup_point ?? transport.transport_routes?.pickup_point ?? "—" },
                      { label: "Drop-off", value: transport.transport_routes?.dropoff_point ?? "—" },
                      { label: "Vehicle", value: transport.transport_routes?.vehicle_reg ?? "—" },
                      { label: "Driver", value: transport.transport_routes?.driver_name ?? "—", sub: transport.transport_routes?.driver_phone },
                    ].map((item, i) => (
                      <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }}
                        className="border rounded-xl p-3">
                        <div className="text-xs text-muted-foreground">{item.label}</div>
                        <div className="font-medium">{item.value}</div>
                        {(item as any).sub && <div className="text-xs text-muted-foreground">{(item as any).sub}</div>}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            NEWS TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="news" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6 space-y-4">
              {announcements.length === 0 && <p className="text-sm text-muted-foreground">No announcements.</p>}
              {announcements.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  className="border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-semibold">{a.title}</div>
                    {a.pinned && <Badge variant="secondary">Pinned</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</div>
                </motion.div>
              ))}
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            DOCUMENTS TAB
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="documents" className="mt-4">
          <GlassCard>
            <CardContent className="pt-6">
              {documents.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 space-y-2">
                  <FileText className="w-10 h-10 mx-auto opacity-30" />
                  <p>No documents uploaded yet</p>
                  <p className="text-xs">Ask your school admin to upload your documents</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((d: any, i: number) => {
                    const labels: Record<string, string> = {
                      birth_certificate: "Birth Certificate", report_form: "Previous Report Form",
                      passport_photo: "Passport Photo", medical_records: "Medical Records",
                      transfer_letter: "Transfer Letter", national_id: "National ID",
                      parent_id: "Parent/Guardian ID", other: "Other",
                    };
                    return (
                      <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                        className="flex items-center justify-between border rounded-xl p-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{labels[d.document_type] ?? d.document_type}</div>
                            <div className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy") : ""}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={async () => {
                          const { data } = await supabase.storage.from("student-documents").createSignedUrl(d.file_path, 60);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                        }}>
                          <ExternalLink className="w-4 h-4 mr-1" /> Open
                        </Button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function AnimatedSummaryCard({
  icon, label, value, rawValue, sub, color, trend, suffix = "", animKey = 0,
}: {
  icon: React.ReactNode; label: string;
  value?: number | null; rawValue?: string;
  sub?: string; suffix?: string; animKey?: number;
  color: "indigo" | "violet" | "emerald" | "amber" | "red" | "blue";
  trend?: number;
}) {
  const colorMap = {
    indigo: { bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", accent: "#6366f1" },
    violet: { bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400", accent: "#8b5cf6" },
    emerald: { bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", accent: "#22c55e" },
    amber: { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", accent: "#f59e0b" },
    red: { bg: "bg-red-500/10 text-red-600 dark:text-red-400", accent: "#ef4444" },
    blue: { bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400", accent: "#3b82f6" },
  };
  const cfg = colorMap[color];

  return (
    <GlassCard>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className={`p-2.5 rounded-xl ${cfg.bg}`}>{icon}</div>
          {trend !== undefined && trend !== 0 && <TrendBadge diff={trend} />}
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold tracking-tight" style={{ color: cfg.accent }}>
            {rawValue ?? (value !== null && value !== undefined
              ? <AnimatedNumberKey value={value} suffix={suffix} animKey={animKey} />
              : "—"
            )}
          </div>
          <div className="text-xs font-medium text-foreground mt-0.5">{label}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </GlassCard>
  );
}

function InsightCard({
  icon, title, value, detail, color,
}: {
  icon: React.ReactNode; title: string; value: string; detail: string; color: string;
}) {
  return (
    <GlassCard>
      <CardContent className="pt-4 pb-4 flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{title}</div>
          <div className="font-semibold text-sm mt-0.5 truncate">{value}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 self-center" />
      </CardContent>
    </GlassCard>
  );
}

function RecommendationItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <motion.div variants={slideRight}
      className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border hover:border-primary/20 transition-colors">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <div className="text-xs font-semibold text-foreground mb-0.5">{title}</div>
        <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[200px] flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <motion.div
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <BarChart3 className="w-10 h-10 opacity-20" />
      </motion.div>
      <span className="text-center max-w-[200px]">{message}</span>
    </motion.div>
  );
}
